import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontRoot = path.resolve(scriptDir, "..")

const PRODUCTION_HARD_LIMIT = 2_500
const PRODUCTION_SOFT_LIMIT = 600
const E2E_ROOT_SPEC_HARD_LIMIT = 2_500
const E2E_ROOT_SPEC_ADVISORY_LIMIT = 800

const normalizePath = (value) => value.split(path.sep).join("/")

const productionSoftAllowlist = {
  "src/routes/Admin/EditorStudioWorkspaceControllerRoot.tsx": {
    issue: "#398",
    reason:
      "editor studio route orchestrator is below the 1,000 line hard budget after root split",
    expires:
      "split below 600 when routing/runtime state can be moved without re-coupling the editor flow",
  },
  "src/routes/Admin/EditorStudioWorkspaceControllerRootView.tsx": {
    issue: "#398",
    reason:
      "editor studio root view owns the dedicated editor/admin layout bridge and remains below hard budget",
    expires:
      "split below 600 when view props are reduced by a narrower editor surface contract",
  },
}

const e2eRootAllowlist = {}

const productionRoots = ["src", "pages"]
const generatedPathPatterns = [
  /(^|\/)__generated__\//,
  /(^|\/)generated\//,
  /\.generated\./,
  /\.d\.ts$/,
]

const isSourceFile = (filePath) => /\.(ts|tsx|mts|cts)$/.test(filePath)
const isProductionFile = (filePath) =>
  isSourceFile(filePath) &&
  !generatedPathPatterns.some((pattern) => pattern.test(filePath))

const readSource = (relativePath) => {
  const absolutePath = path.join(frontRoot, relativePath)
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing required boundary file: ${relativePath}`)
  }
  return readFileSync(absolutePath, "utf8")
}

const countLines = (source) => source.split(/\r?\n/).length

const walk = (relativeDir) => {
  const absoluteDir = path.join(frontRoot, relativeDir)
  const files = []

  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = normalizePath(path.join(relativeDir, entry.name))
    if (entry.isDirectory()) {
      files.push(...walk(relativePath))
      continue
    }

    if (entry.isFile()) {
      files.push(relativePath)
    }
  }

  return files
}

const validateAllowlistEntry = (allowlistName, relativePath, entry) => {
  const missingFields = ["issue", "reason", "expires"].filter(
    (field) => !entry?.[field]
  )
  if (missingFields.length > 0) {
    return `${allowlistName} allowlist entry ${relativePath} is missing: ${missingFields.join(
      ", "
    )}`
  }
  return null
}

const failures = []
const warnings = []

for (const relativePath of Object.keys(productionSoftAllowlist)) {
  const error = validateAllowlistEntry(
    "production-soft",
    relativePath,
    productionSoftAllowlist[relativePath]
  )
  if (error) failures.push(error)
}

for (const relativePath of Object.keys(e2eRootAllowlist)) {
  const error = validateAllowlistEntry(
    "e2e-root",
    relativePath,
    e2eRootAllowlist[relativePath]
  )
  if (error) failures.push(error)
}

const productionFiles = productionRoots
  .filter((relativeDir) => existsSync(path.join(frontRoot, relativeDir)))
  .flatMap(walk)
  .filter(isProductionFile)

for (const relativePath of productionFiles) {
  const lines = countLines(readSource(relativePath))

  if (lines > PRODUCTION_HARD_LIMIT) {
    failures.push(
      [
        `${relativePath} has ${lines} lines; production files must stay`,
        `<= ${PRODUCTION_HARD_LIMIT}. Split orchestration/view/model`,
        "responsibility and link the owning issue.",
      ].join(" ")
    )
    continue
  }

  if (lines > PRODUCTION_SOFT_LIMIT && !productionSoftAllowlist[relativePath]) {
    warnings.push(
      [
        `${relativePath} has ${lines} lines; consider splitting when it can`,
        "be done without compressing code or hiding responsibility.",
      ].join(" ")
    )
  }
}

for (const relativePath of Object.keys(productionSoftAllowlist)) {
  if (!productionFiles.includes(relativePath)) {
    failures.push(`Stale production soft allowlist entry: ${relativePath}`)
  }
}

const e2eRootSpecs = walk("e2e").filter((relativePath) =>
  /^e2e\/[^/]+\.spec\.ts$/.test(relativePath)
)

for (const relativePath of e2eRootSpecs) {
  const lines = countLines(readSource(relativePath))
  if (lines > E2E_ROOT_SPEC_HARD_LIMIT) {
    failures.push(
      [
        `${relativePath} has ${lines} lines; root E2E specs must stay`,
        `<= ${E2E_ROOT_SPEC_HARD_LIMIT} or move responsibility into split`,
        "specs/helpers.",
      ].join(" ")
    )
    continue
  }

  if (lines > E2E_ROOT_SPEC_ADVISORY_LIMIT && !e2eRootAllowlist[relativePath]) {
    warnings.push(
      [
        `${relativePath} has ${lines} lines; consider moving repeated`,
        "setup/assertions into helpers instead of compressing test code.",
      ].join(" ")
    )
  }
}

for (const relativePath of Object.keys(e2eRootAllowlist)) {
  if (!e2eRootSpecs.includes(relativePath)) {
    failures.push(`Stale E2E root allowlist entry: ${relativePath}`)
  }
}

/**
 * 마케팅 표면(회사·제품 랜딩)은 블로그 앱 안에 있지만 언제든 별도 저장소로 추출할 수 있어야 한다
 * (docs/marketing-surface-extraction.md). 같은 경계를 front/.eslintrc.json도 막지만 그 규칙은
 * import 문자열이 `src/...` 형태일 때만 본다 - 상대 경로로 같은 곳을 가져오면 통과한다. 아래
 * 정규식은 절대·상대 두 형태를 함께 막아 그 구멍을 덮는다.
 */
const MARKETING_MODULE_FORBIDDEN = [
  /from "[^"]*\/apis\//,
  /from "[^"]*\/hooks\//,
  /from "[^"]*\/pages\//,
  /from "[^"]*\/components\/(?!branding\/)/,
  /from "\.\.\//,
]

const MARKETING_MODULE_HINT =
  "Marketing surface modules may only depend on their own module, src/design-system, src/styles, src/components/branding, and site.config so the surface stays extractable into its own repository."

const MARKETING_ENTRYPOINT_HINT =
  "Marketing page entrypoints own the seam between blog infrastructure and one marketing module, and pass plain props down. Styling and design tokens stay inside the module."

const ownershipRules = [
  {
    file: "src/routes/Admin/EditorStudioWorkspaceController.tsx",
    required: ['from "./EditorStudioWorkspaceControllerRoot"'],
    forbidden: [/\buseState\(/, /\buseEffect\(/, /\bapiFetch\b/],
    hint: "EditorStudioWorkspaceController is a thin compatibility entry.",
  },
  {
    file: "src/routes/Admin/EditorStudioWorkspaceControllerRoot.tsx",
    required: [
      'from "./EditorStudioWorkspaceControllerRootModel"',
      'from "./EditorStudioWorkspaceControllerRootView"',
      'from "./useEditorStudioAdminPostFlow"',
      'from "./useEditorStudioDraftLifecycle"',
      'from "./useEditorStudioPersistence"',
      'from "./useEditorStudioRouting"',
    ],
    forbidden: [/\bstyled\./],
    hint: "Editor studio root must keep runtime, model, and view contracts delegated.",
  },
  {
    file: "src/routes/Detail/PostDetail/index.tsx",
    required: [
      'from "./PostDetail.styles"',
      'from "./PostDetailRelatedSection"',
      'from "./PostDetailTocModel"',
      'from "./PostDetailRailModel"',
      'from "./PostDetailActionSections"',
      'from "./usePostDetailEngagementActions"',
      'from "./usePostDetailRelatedPosts"',
    ],
    forbidden: [/\bstyled\./],
    hint: "PostDetail must keep rail, toc, actions, related posts, and styles delegated.",
  },
  {
    file: "src/routes/Feed/FeedExplorer.tsx",
    required: [
      'from "./FeedExplorer.styles"',
      'from "./FeedExplorerRestoreModel"',
    ],
    forbidden: [/\bstyled\./],
    hint: "FeedExplorer must keep restore/cache model and styles delegated.",
  },
  {
    file: "src/routes/Admin/AdminPostsWorkspacePage.tsx",
    required: [
      'from "./AdminPostsWorkspaceModel"',
      'from "./AdminPostsWorkspacePageCommands"',
      'from "./AdminPostsWorkspacePageView"',
    ],
    forbidden: [/\bstyled\./],
    hint: "Admin posts workspace page must keep command/model/view responsibilities split.",
  },
  {
    file: "src/layouts/RootLayout/Header/NotificationBell.tsx",
    required: [
      'from "./NotificationBellPanel"',
      'from "./NotificationBell.styles"',
      'from "./useNotificationBellState"',
    ],
    forbidden: [/\bEventSource\b/, /\blocalStorage\b/, /\bfetch\(/],
    hint: "NotificationBell must assemble state, panel, and styles without owning transport/storage.",
  },
  {
    file: "src/apis/backend/posts.ts",
    required: [
      'from "./posts/PostApiDtos"',
      'from "./posts/PostApiCache"',
      'from "./posts/PostApiMappers"',
      'from "./posts/PostApiRequests"',
    ],
    forbidden: [/\bapiFetch\b/, /\baxios\b/, /\bqueryClient\b/],
    hint: "posts.ts must stay a facade over DTO/cache/mapper/request modules.",
  },
  {
    file: "src/routes/Company/CompanyPageView.tsx",
    required: [
      'from "src/routes/Company/CompanyPageModel"',
      'from "src/routes/Company/CompanyPage.styles"',
      'from "src/routes/Company/CompanySection.styles"',
    ],
    forbidden: [...MARKETING_MODULE_FORBIDDEN, /from "[^"]*\/routes\/(?!Company\/)/],
    hint: MARKETING_MODULE_HINT,
  },
  {
    file: "src/routes/Company/CompanyPageModel.ts",
    required: ['from "site.config"'],
    forbidden: [
      ...MARKETING_MODULE_FORBIDDEN,
      /from "[^"]*\/routes\/(?!Company\/)/,
      /\bstyled\./,
    ],
    hint: MARKETING_MODULE_HINT,
  },
  {
    file: "src/routes/EasySubway/EasySubwayPageView.tsx",
    required: [
      'from "src/routes/EasySubway/EasySubwayPageModel"',
      'from "src/routes/EasySubway/EasySubwayPage.styles"',
    ],
    forbidden: [...MARKETING_MODULE_FORBIDDEN, /from "[^"]*\/routes\/(?!EasySubway\/)/],
    hint: MARKETING_MODULE_HINT,
  },
  {
    file: "src/routes/EasySubway/EasySubwayPageModel.ts",
    required: ['from "site.config"'],
    forbidden: [
      ...MARKETING_MODULE_FORBIDDEN,
      /from "[^"]*\/routes\/(?!EasySubway\/)/,
      /\bstyled\./,
    ],
    hint: MARKETING_MODULE_HINT,
  },
  {
    file: "src/pages/company/index.tsx",
    required: [
      'from "src/routes/Company/CompanyPageView"',
      'from "src/routes/Company/CompanyPageModel"',
      'from "src/libs/publicSurfaceUrl"',
    ],
    forbidden: [
      /from "[^"]*\/routes\/(?!Company\/)/,
      /from "[^"]*\/design-system\//,
      /\bstyled\./,
    ],
    hint: MARKETING_ENTRYPOINT_HINT,
  },
  {
    file: "src/pages/easysubway/index.tsx",
    required: [
      'from "src/routes/EasySubway/EasySubwayPageView"',
      'from "src/routes/EasySubway/EasySubwayPageModel"',
      'from "src/libs/publicSurfaceUrl"',
    ],
    forbidden: [
      /from "[^"]*\/routes\/(?!EasySubway\/)/,
      /from "[^"]*\/design-system\//,
      /\bstyled\./,
    ],
    hint: MARKETING_ENTRYPOINT_HINT,
  },
]

for (const rule of ownershipRules) {
  const source = readSource(rule.file)
  for (const expected of rule.required) {
    if (!source.includes(expected)) {
      failures.push(
        `${rule.file} is missing required boundary token ${JSON.stringify(
          expected
        )}. ${rule.hint}`
      )
    }
  }
  for (const pattern of rule.forbidden) {
    if (pattern.test(source)) {
      failures.push(
        `${rule.file} contains forbidden ownership pattern ${pattern}. ${rule.hint}`
      )
    }
  }
}

if (failures.length > 0) {
  console.error("[refactor-boundaries] failed")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

if (warnings.length > 0) {
  console.warn("[refactor-boundaries] warnings")
  for (const warning of warnings) {
    console.warn(`- ${warning}`)
  }
}

console.log(
  [
    "[refactor-boundaries] ok",
    `production=${
      productionFiles.length
    } hard<=${PRODUCTION_HARD_LIMIT} soft<=${PRODUCTION_SOFT_LIMIT} allowlist=${
      Object.keys(productionSoftAllowlist).length
    }`,
    `e2eRootSpecs=${
      e2eRootSpecs.length
    } hard<=${E2E_ROOT_SPEC_HARD_LIMIT} advisory<=${E2E_ROOT_SPEC_ADVISORY_LIMIT} allowlist=${
      Object.keys(e2eRootAllowlist).length
    }`,
    `ownershipRules=${ownershipRules.length}`,
  ].join(" | ")
)
