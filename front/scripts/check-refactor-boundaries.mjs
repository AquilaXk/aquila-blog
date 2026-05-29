import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontRoot = path.resolve(scriptDir, "..")

const PRODUCTION_HARD_LIMIT = 1000
const PRODUCTION_SOFT_LIMIT = 600
const E2E_ROOT_SPEC_LIMIT = 800

const normalizePath = (value) => value.split(path.sep).join("/")

const productionSoftAllowlist = {
  "src/routes/Admin/EditorStudioWorkspaceControllerRoot.tsx": {
    issue: "#398",
    reason: "editor studio route orchestrator is below the 1,000 line hard budget after root split",
    expires: "split below 600 when routing/runtime state can be moved without re-coupling the editor flow",
  },
  "src/routes/Admin/EditorStudioWorkspaceControllerRootView.tsx": {
    issue: "#398",
    reason: "editor studio root view owns the dedicated editor/admin layout bridge and remains below hard budget",
    expires: "split below 600 when view props are reduced by a narrower editor surface contract",
  },
  "src/components/editor/BlockEditorEngine.editorSurfaceStyles.tsx": {
    issue: "#390",
    reason: "editor surface style module is a style-only companion and remains below the 1,000 line style budget",
    expires: "split when shared typography/style tokens remove editor-surface-only declarations",
  },
  "src/components/editor/BlockEditorEngine.viewportLayer.tsx": {
    issue: "#390",
    reason: "viewport layer is a single render layer below the 1,000 line layer budget",
    expires: "split when block handle, bubble toolbar, and viewport props are independently owned",
  },
  "src/components/editor/BlockEditorEngine.tableStyles.tsx": {
    issue: "#390",
    reason: "table style module is a style-only companion and remains below the 1,000 line style budget",
    expires: "split when table chrome tokens are promoted to shared primitives",
  },
  "src/components/editor/tableTextSelectionModel.ts": {
    issue: "#515",
    reason: "table text-range drag recovery remains centralized while multi-cell regressions are stabilized",
    expires: "split below 600 after explicit drag tracking and frame-preserve logic move into dedicated helpers",
  },
  "src/components/editor/codeBlockNodeView.tsx": {
    issue: "#545",
    reason: "editor table/cell selection and code-block selection interceptions are fixed in-place; split into dedicated helpers after regression extraction",
    expires: "split below 600 when code-block selection, drag-preserve, and select-all interception are modularized",
  },
}

const e2eRootAllowlist = {
  "e2e/source-boundary-editor-studio.spec.ts": {
    issue: "#423",
    reason: "aggregate source-boundary contracts moved out of editor-studio-state; final guard script covers recurring budgets",
    expires: "shrink below 800 after exact string contracts are fully migrated into data-driven guard tables",
  },
}

const productionRoots = ["src", "pages"]
const generatedPathPatterns = [
  /(^|\/)__generated__\//,
  /(^|\/)generated\//,
  /\.generated\./,
  /\.d\.ts$/,
]

const isSourceFile = (filePath) => /\.(ts|tsx|mts|cts)$/.test(filePath)
const isProductionFile = (filePath) => isSourceFile(filePath) && !generatedPathPatterns.some((pattern) => pattern.test(filePath))

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
  const missingFields = ["issue", "reason", "expires"].filter((field) => !entry?.[field])
  if (missingFields.length > 0) {
    return `${allowlistName} allowlist entry ${relativePath} is missing: ${missingFields.join(", ")}`
  }
  return null
}

const failures = []

for (const relativePath of Object.keys(productionSoftAllowlist)) {
  const error = validateAllowlistEntry("production-soft", relativePath, productionSoftAllowlist[relativePath])
  if (error) failures.push(error)
}

for (const relativePath of Object.keys(e2eRootAllowlist)) {
  const error = validateAllowlistEntry("e2e-root", relativePath, e2eRootAllowlist[relativePath])
  if (error) failures.push(error)
}

const productionFiles = productionRoots.filter((relativeDir) => existsSync(path.join(frontRoot, relativeDir))).flatMap(walk).filter(isProductionFile)

for (const relativePath of productionFiles) {
  const lines = countLines(readSource(relativePath))

  if (lines > PRODUCTION_HARD_LIMIT) {
    failures.push(
      `${relativePath} has ${lines} lines; production files must stay <= ${PRODUCTION_HARD_LIMIT}. Split orchestration/view/model responsibility and link the owning issue.`
    )
    continue
  }

  if (lines > PRODUCTION_SOFT_LIMIT && !productionSoftAllowlist[relativePath]) {
    failures.push(
      `${relativePath} has ${lines} lines; files over ${PRODUCTION_SOFT_LIMIT} require an explicit allowlist entry with issue, reason, and expiry.`
    )
  }
}

for (const relativePath of Object.keys(productionSoftAllowlist)) {
  if (!productionFiles.includes(relativePath)) {
    failures.push(`Stale production soft allowlist entry: ${relativePath}`)
  }
}

const e2eRootSpecs = walk("e2e").filter((relativePath) => /^e2e\/[^/]+\.spec\.ts$/.test(relativePath))

for (const relativePath of e2eRootSpecs) {
  const lines = countLines(readSource(relativePath))
  if (lines > E2E_ROOT_SPEC_LIMIT && !e2eRootAllowlist[relativePath]) {
    failures.push(
      `${relativePath} has ${lines} lines; root E2E specs must stay <= ${E2E_ROOT_SPEC_LIMIT} or move responsibility into split specs/helpers with an allowlist expiry.`
    )
  }
}

for (const relativePath of Object.keys(e2eRootAllowlist)) {
  if (!e2eRootSpecs.includes(relativePath)) {
    failures.push(`Stale E2E root allowlist entry: ${relativePath}`)
  }
}

const ownershipRules = [
  {
    file: "src/components/editor/BlockEditorEngine.tsx",
    required: [
      'from "./useBlockEditorEngineController"',
      'from "./BlockEditorEngine.layers"',
      'from "./BlockEditorEngine.tableOverlayLayer"',
      'from "./BlockEditorEngine.styles"',
    ],
    forbidden: [/\bstyled\./, /\buseEditor\(/, /\buseEffect\(/],
    hint: "BlockEditorEngine must remain a render wrapper; controller, layers, and styles own the heavy work.",
  },
  {
    file: "src/components/editor/useBlockEditorEngineController.ts",
    required: [
      'from "./useBlockEditorTableOverlayController"',
      'from "./useBlockEditorEngineBlockDrag"',
      'from "./useBlockEditorEngineBlockSelectionUi"',
      'from "./useBlockEditorEngineControllerState"',
      'from "./useBlockEditorEngineInsertActions"',
      'from "./useBlockEditorEngineSlashMenu"',
    ],
    forbidden: [/\bstyled\./],
    hint: "The engine controller must delegate table, drag, selection, insert, and slash responsibilities.",
  },
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
    required: ['from "./FeedExplorer.styles"', 'from "./FeedExplorerRestoreModel"'],
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
]

for (const rule of ownershipRules) {
  const source = readSource(rule.file)
  for (const expected of rule.required) {
    if (!source.includes(expected)) {
      failures.push(`${rule.file} is missing required boundary token ${JSON.stringify(expected)}. ${rule.hint}`)
    }
  }
  for (const pattern of rule.forbidden) {
    if (pattern.test(source)) {
      failures.push(`${rule.file} contains forbidden ownership pattern ${pattern}. ${rule.hint}`)
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

console.log(
  [
    "[refactor-boundaries] ok",
    `production=${productionFiles.length} hard<=${PRODUCTION_HARD_LIMIT} soft<=${PRODUCTION_SOFT_LIMIT} allowlist=${Object.keys(productionSoftAllowlist).length}`,
    `e2eRootSpecs=${e2eRootSpecs.length} limit<=${E2E_ROOT_SPEC_LIMIT} allowlist=${Object.keys(e2eRootAllowlist).length}`,
    `ownershipRules=${ownershipRules.length}`,
  ].join(" | ")
)
