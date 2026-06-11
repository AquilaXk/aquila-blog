import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

type AuditClosureEvidence = {
  file: string
  contains?: readonly string[]
  excludes?: readonly string[]
}

type AuditClosureContract = {
  issue: string
  summary: string
  evidence: readonly AuditClosureEvidence[]
}

const frontRoot = path.resolve(__dirname, "..")

const readFrontFile = (relativePath: string) => {
  const absolutePath = path.resolve(frontRoot, relativePath)
  expect(existsSync(absolutePath), `${relativePath} should exist`).toBe(true)
  return readFileSync(absolutePath, "utf8")
}

const ISSUE_CLOSURE_CONTRACTS: readonly AuditClosureContract[] = [
  {
    issue: "#636/#638",
    summary: "저장/수정/발행/브라우저 임시저장은 route state보다 editor markdown flush를 먼저 사용한다",
    evidence: [
      {
        file: "src/components/editor/blockEditorContract.ts",
        contains: ["export type BlockEditorMarkdownFlush = () => string", "onFlushMarkdownReady?:"],
      },
      {
        file: "src/components/editor/useBlockEditorMarkdownCommit.ts",
        contains: ["fallbackEditor?: TiptapEditor | null", "flushPendingNodeViewAttributeCommits()"],
      },
      {
        file: "src/components/editor/useBlockEditorEngineController.ts",
        contains: ["const flushCurrentMarkdown = useCallback(", "onFlushMarkdownReady?.(flushCurrentMarkdown)"],
      },
      {
        file: "src/routes/Admin/EditorStudioWorkspaceControllerRoot.tsx",
        contains: ["const flushEditorMarkdownRef = useRef<BlockEditorMarkdownFlush | null>(null)", "const getCurrentPostContent = useCallback("],
      },
      {
        file: "src/routes/Admin/useEditorStudioPersistence.ts",
        contains: ["const currentPostContent = getCurrentPostContent()"],
        excludes: ["const currentPostContent = postContentLiveRef.current"],
      },
      {
        file: "src/routes/Admin/useEditorStudioDraftLifecycleModel.ts",
        contains: ["content: getCurrentPostContent()"],
      },
      {
        file: "e2e/editor-temp-draft.spec.ts",
        contains: ["브라우저 임시저장은 editor debounce commit 전에도 최신 본문을 저장한다"],
      },
    ],
  },
  {
    issue: "#639",
    summary: "node-view debounce attribute commit은 markdown flush 전에 동기화된다",
    evidence: [
      {
        file: "src/components/editor/editorNodeViewCommitRegistry.ts",
        contains: ["export const registerPendingNodeViewCommitFlusher", "export const flushPendingNodeViewAttributeCommits = () =>"],
      },
      {
        file: "src/components/editor/editorNodeViewShared.ts",
        contains: ["registerPendingNodeViewCommitFlusher(flush)"],
      },
      {
        file: "src/components/editor/mermaidNodeViewModel.tsx",
        contains: ["registerPendingNodeViewCommitFlusher(flush)"],
      },
      {
        file: "src/components/editor/useBlockEditorMarkdownCommit.ts",
        contains: ["flushPendingNodeViewAttributeCommits()"],
      },
      {
        file: "e2e/editor-temp-draft.spec.ts",
        contains: ["브라우저 임시저장은 node-view debounce commit 전에도 최신 수식 본문을 저장한다"],
      },
    ],
  },
  {
    issue: "#640/#641",
    summary: "literal markdown, 내부 fence, nested list/task list는 serialize/parse round-trip으로 보존된다",
    evidence: [
      {
        file: "src/components/editor/serializationInlineNormalization.ts",
        contains: ["export const escapeMarkdownInlineText", "escapeMarkdownInlineText(rawText)"],
      },
      {
        file: "src/components/editor/serializationMarkdownExport.ts",
        contains: ["const getMarkdownFence = (content: string) =>", "const serializeList = (node: JSONContent, depth = 0): string =>", "serializeList(child, depth + 1)"],
      },
      {
        file: "src/components/editor/serializationHtmlImport.ts",
        contains: ['if (line.kind === "task") return "taskList"'],
      },
      {
        file: "e2e/block-editor-serialization.spec.ts",
        contains: [
          "literal markdown text 는 inline delimiter 로 재파싱되지 않는다",
          "code 와 mermaid block 내부 fence line 은 더 긴 fence 로 보존된다",
          "nested bullet/task list 는 serialize 후 재파싱해도 하위 item 을 보존한다",
        ],
      },
    ],
  },
  {
    issue: "#642",
    summary: "table text selection restore fallback은 active editor root 안에서만 table 후보를 찾는다",
    evidence: [
      {
        file: "src/components/editor/tableTextSelectionModel.ts",
        contains: ["resolveTableTextOwnerRoot", 'ownerRoot.querySelectorAll<HTMLTableElement>("table")'],
        excludes: ['document.querySelectorAll<HTMLTableElement>("table")', 'document.querySelectorAll("table")'],
      },
      {
        file: "e2e/editor-authoring-route-table-text-boundary.spec.ts",
        contains: ["table text restore source contract는 disconnected fallback을 editor root로 제한한다"],
      },
    ],
  },
  {
    issue: "#643/#644",
    summary: "장문 code block selection listener와 bubble occlusion 측정은 node/editor 전체 크기에 선형 증가하지 않는다",
    evidence: [
      {
        file: "src/components/editor/codeBlockNodeView.tsx",
        contains: ["registerCodeBlockGlobalEventProvider", "activateCodeBlockWindowDragProvider"],
        excludes: [
          'window.addEventListener("pointerdown", handleDocumentCodePointer, true)',
          'window.addEventListener("keydown", handleDocumentSelectAll, true)',
          'window.addEventListener("mousemove", handleWindowMouseMove, true)',
        ],
      },
      {
        file: "src/components/editor/useFloatingBubbleState.ts",
        contains: ["MAX_TEXT_BUBBLE_OCCLUSION_CANDIDATES", "resolveVisibleSelectionAnchorRect", "collectTextBubbleOcclusionCandidates"],
        excludes: ["editorRoot.querySelectorAll<HTMLElement>(TEXT_BUBBLE_OCCLUSION_SELECTOR)"],
      },
      {
        file: "e2e/editor-performance-contract.spec.ts",
        contains: [
          "code block global selection events are shared instead of mounted per node view",
          "selection bubble occlusion reads local selection candidates instead of the full editor tree",
        ],
      },
      {
        file: "e2e/editor-authoring-route-live-drag-sequence.spec.ts",
        contains: [
          "실제 507 하단 table Cmd+A 뒤 code/body drag selection은 stale table 선택에 잡히지 않는다",
          "expectPost507FinalTableBlockOverlayFollowsScroll",
        ],
      },
    ],
  },
]

test.describe("editor audit open issue closure status", () => {
  for (const contract of ISSUE_CLOSURE_CONTRACTS) {
    test(`${contract.issue} closure evidence stays wired`, () => {
      expect(contract.summary.length, `${contract.issue} should describe the fixed risk`).toBeGreaterThan(20)

      for (const evidence of contract.evidence) {
        const source = readFrontFile(evidence.file)

        evidence.contains?.forEach((snippet) => {
          expect(source, `${contract.issue} missing ${snippet} in ${evidence.file}`).toContain(snippet)
        })
        evidence.excludes?.forEach((snippet) => {
          expect(source, `${contract.issue} should not reintroduce ${snippet} in ${evidence.file}`).not.toContain(snippet)
        })
      }
    })
  }
})
