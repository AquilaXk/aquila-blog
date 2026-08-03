import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

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
 * (docs/ops/marketing-surface-extraction.md). 같은 경계를 front/.eslintrc.json도 막지만 그 규칙은
 * 정적 `import` 선언만 보고, 그중에서도 import 문자열이 `src/...` 형태일 때만 group 패턴에 걸린다 -
 * 상대 경로·동적 `import()`·`require()`로 같은 곳을 가져오면 통과한다. 그래서 아래 검사는 문자열
 * 매칭이 아니라 TypeScript AST에서 모듈 지정자를 뽑아 front 루트 기준 경로로 정규화한 뒤 allowlist와
 * 대조한다. 정규화하지 않으면 `src/routes/Company/../Blog`처럼 자기 모듈로 위장한 경로를 놓친다.
 */
const MARKETING_MODULE_INTERNAL_ALLOWLIST = [
  "site.config",
  "src/components/branding",
  "src/design-system",
  "src/styles",
]

/** 새 저장소도 그대로 갖게 되는 런타임 패키지만 허용한다. 그 밖의 외부 의존은 추출 비용이므로 결정 대상이다. */
const MARKETING_MODULE_EXTERNAL_ALLOWLIST = [
  "@emotion/react",
  "@emotion/styled",
  "react",
  "react-dom",
]

const MARKETING_MODULES = [
  { dir: "src/routes/Company", entrypoint: "src/pages/company/index.tsx" },
  { dir: "src/routes/EasySubway", entrypoint: "src/pages/easysubway/index.tsx" },
]

const MODULE_ID_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  "/index.ts",
  "/index.tsx",
  "/index.js",
]

/** front/tsconfig.json의 baseUrl이 "."이라 비상대 지정자도 앱 안을 먼저 가리킨다. */
const isFrontModulePath = (candidate) =>
  MODULE_ID_SUFFIXES.some((suffix) =>
    existsSync(path.join(frontRoot, `${candidate}${suffix}`))
  )

const resolveModuleTarget = (specifier, fromFile) => {
  if (specifier.startsWith(".")) {
    return {
      external: false,
      target: normalizePath(
        path.normalize(path.join(path.dirname(fromFile), specifier))
      ),
    }
  }

  const normalized = normalizePath(path.normalize(specifier))
  // 루트 밖으로 나가는 경로는 앱 경계를 이미 벗어났으므로 외부 패키지로 봐주지 않는다.
  const external = !normalized.startsWith("../") && !isFrontModulePath(normalized)
  return { external, target: normalized }
}

const isUnderModulePath = (target, allowed) =>
  target === allowed || target.startsWith(`${allowed}/`)

const collectModuleReferences = (relativePath, source) => {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const references = []

  const moduleSpecifierOf = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      return node.moduleSpecifier
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      return node.moduleReference.expression
    }
    if (!ts.isCallExpression(node) || node.arguments.length === 0) return undefined
    const isModuleLoad =
      node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require")
    return isModuleLoad ? node.arguments[0] : undefined
  }

  const visit = (node) => {
    const specifierNode = moduleSpecifierOf(node)
    if (specifierNode) {
      references.push({
        line:
          sourceFile.getLineAndCharacterOfPosition(
            specifierNode.getStart(sourceFile)
          ).line + 1,
        specifier: ts.isStringLiteralLike(specifierNode)
          ? specifierNode.text
          : null,
        text: specifierNode.getText(sourceFile),
      })
    }
    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)
  return references
}

const MARKETING_MODULE_HINT =
  "Marketing surface modules may only depend on their own module, src/design-system, src/styles, src/components/branding, site.config, and the react/emotion runtime packages so the surface stays extractable into its own repository."

const MARKETING_ENTRYPOINT_HINT =
  "Marketing page entrypoints own the seam between blog infrastructure and one marketing module, and pass plain props down. Styling and design tokens stay inside the module."

const MARKETING_REVERSE_HINT =
  "Only the marketing entrypoints src/pages/company and src/pages/easysubway may import the marketing surface modules. Blog code must not depend on them so the surface stays extractable into its own repository."

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
    hint: MARKETING_MODULE_HINT,
  },
  {
    file: "src/routes/Company/CompanyPageModel.ts",
    required: ['from "site.config"'],
    forbidden: [/\bstyled\./],
    hint: MARKETING_MODULE_HINT,
  },
  {
    file: "src/routes/EasySubway/EasySubwayPageView.tsx",
    required: [
      'from "src/routes/EasySubway/EasySubwayPageModel"',
      'from "src/routes/EasySubway/EasySubwayPage.styles"',
    ],
    hint: MARKETING_MODULE_HINT,
  },
  {
    file: "src/routes/EasySubway/EasySubwayPageModel.ts",
    required: ['from "site.config"'],
    forbidden: [/\bstyled\./],
    hint: MARKETING_MODULE_HINT,
  },
  {
    file: "src/pages/company/index.tsx",
    required: [
      'from "src/routes/Company/CompanyPageView"',
      'from "src/routes/Company/CompanyPageModel"',
      'from "src/libs/publicSurfaceUrl"',
    ],
    forbidden: [/\bstyled\./],
    hint: MARKETING_ENTRYPOINT_HINT,
  },
  {
    file: "src/pages/easysubway/index.tsx",
    required: [
      'from "src/routes/EasySubway/EasySubwayPageView"',
      'from "src/routes/EasySubway/EasySubwayPageModel"',
      'from "src/libs/publicSurfaceUrl"',
    ],
    forbidden: [/\bstyled\./],
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
  for (const pattern of rule.forbidden ?? []) {
    if (pattern.test(source)) {
      failures.push(
        `${rule.file} contains forbidden ownership pattern ${pattern}. ${rule.hint}`
      )
    }
  }
}

const marketingBoundaryFiles = []

const checkMarketingModuleFile = (relativePath, allowedInternal) => {
  marketingBoundaryFiles.push(relativePath)

  for (const reference of collectModuleReferences(
    relativePath,
    readSource(relativePath)
  )) {
    if (reference.specifier === null) {
      failures.push(
        `${relativePath}:${reference.line} loads a module by computed specifier ${reference.text}; the marketing boundary can only be checked on literal paths. ${MARKETING_MODULE_HINT}`
      )
      continue
    }

    const { external, target } = resolveModuleTarget(reference.specifier, relativePath)
    const allowlist = external
      ? MARKETING_MODULE_EXTERNAL_ALLOWLIST
      : allowedInternal
    if (allowlist.some((allowed) => isUnderModulePath(target, allowed))) continue

    failures.push(
      `${relativePath}:${reference.line} imports ${JSON.stringify(
        reference.specifier
      )}${
        external ? " (external package)" : ` (resolves to ${target})`
      }, which is not on the marketing module allowlist. ${MARKETING_MODULE_HINT}`
    )
  }
}

const checkMarketingEntrypointFile = (relativePath, moduleDir) => {
  marketingBoundaryFiles.push(relativePath)

  for (const reference of collectModuleReferences(
    relativePath,
    readSource(relativePath)
  )) {
    if (reference.specifier === null) {
      failures.push(
        `${relativePath}:${reference.line} loads a module by computed specifier ${reference.text}; the marketing boundary can only be checked on literal paths. ${MARKETING_ENTRYPOINT_HINT}`
      )
      continue
    }

    const { external, target } = resolveModuleTarget(reference.specifier, relativePath)
    if (external) continue

    const reachesOtherRoutes =
      isUnderModulePath(target, "src/routes") &&
      !isUnderModulePath(target, moduleDir)
    const reachesDesignSystem = isUnderModulePath(target, "src/design-system")
    if (!reachesOtherRoutes && !reachesDesignSystem) continue

    failures.push(
      `${relativePath}:${reference.line} imports ${JSON.stringify(
        reference.specifier
      )} (resolves to ${target}), which the marketing entrypoint may not own. ${MARKETING_ENTRYPOINT_HINT}`
    )
  }
}

for (const marketingModule of MARKETING_MODULES) {
  const allowedInternal = [
    marketingModule.dir,
    ...MARKETING_MODULE_INTERNAL_ALLOWLIST,
  ]
  for (const relativePath of walk(marketingModule.dir).filter(isProductionFile)) {
    checkMarketingModuleFile(relativePath, allowedInternal)
  }
  checkMarketingEntrypointFile(marketingModule.entrypoint, marketingModule.dir)
}

/**
 * 역방향(블로그 -> 마케팅). front/.eslintrc.json이 막는 것과 같은 경계지만, 그 규칙은 `src/...`
 * 형태의 정적 import만 보므로 상대 경로·동적 import로 마케팅 모듈을 끌어다 쓰면 통과한다. 여기서
 * 같은 경계를 정규화된 경로로 다시 본다. 모듈 이름이 문자열에 없으면 정규화해도 그 안을 가리킬 수
 * 없으므로(계산된 지정자는 이 방향에서 판정하지 않는다) 먼저 걸러 파싱 비용을 줄인다.
 */
const marketingModuleDirs = MARKETING_MODULES.map((marketingModule) => marketingModule.dir)
const marketingModuleNames = marketingModuleDirs.map((dir) => dir.split("/").at(-1))
const marketingEntrypoints = MARKETING_MODULES.map(
  (marketingModule) => marketingModule.entrypoint
)

for (const relativePath of productionFiles) {
  if (marketingEntrypoints.includes(relativePath)) continue
  if (marketingModuleDirs.some((dir) => isUnderModulePath(relativePath, dir))) continue

  const source = readSource(relativePath)
  if (!marketingModuleNames.some((name) => source.includes(name))) continue

  for (const reference of collectModuleReferences(relativePath, source)) {
    if (reference.specifier === null) continue
    const { external, target } = resolveModuleTarget(reference.specifier, relativePath)
    if (external) continue
    if (!marketingModuleDirs.some((dir) => isUnderModulePath(target, dir))) continue

    failures.push(
      `${relativePath}:${reference.line} imports ${JSON.stringify(
        reference.specifier
      )} (resolves to ${target}). ${MARKETING_REVERSE_HINT}`
    )
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
    `marketingBoundaryFiles=${marketingBoundaryFiles.length}`,
  ].join(" | ")
)
