import type { JSONContent } from "@tiptap/core"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import StarterKit from "@tiptap/starter-kit"
import type { MutableRefObject } from "react"
import {
  BookmarkBlock,
  CalloutBlock,
  EditorCodeBlock,
  EditorListItem,
  EditorListKeymap,
  EditorTable,
  EditorTaskItem,
  EditorTaskList,
  EmbedBlock,
  FileBlock,
  FormulaBlock,
  getPreferredCodeLanguage,
  InlineColorMark,
  InlineFormula,
  MermaidBlock,
  RawMarkdownBlock,
  ResizableImage,
  ToggleBlock,
} from "./extensions"
import type {
  BlockEditorFeatureOptions,
  BlockEditorUploadAdapters,
} from "./blockEditorContract"
import {
  createBlockquoteNode,
  createBookmarkNode,
  createCalloutNode,
  createCodeBlockNode,
  createEmbedNode,
  createFileBlockNode,
  createFormulaNode,
  createHeadingNode,
  createHorizontalRuleNode,
  createMermaidNode,
  createOrderedListNode,
  createParagraphNode,
  createTaskListNode,
  createToggleNode,
  createBulletListNode,
} from "./serialization"
import { TABLE_MIN_COLUMN_WIDTH_PX } from "src/libs/markdown/tableMetadata"

type BlockInsertSection = "basic" | "structure" | "media"

export type BlockInsertCatalogItem = {
  id: string
  label: string
  helper?: string
  section: BlockInsertSection
  keywords?: string[]
  slashHint?: string
  recommended?: boolean
  quickInsert?: boolean
  toolbarMore?: boolean
  disabled?: boolean
  insertAtCursor: () => void | boolean | Promise<void>
  insertAtBlock: (blockIndex: number) => void | boolean | Promise<void>
}

export const TABLE_CONTEXT_BLOCKED_INSERT_IDS = new Set([
  "heading-1",
  "heading-2",
  "heading-3",
  "heading-4",
  "bullet-list",
  "ordered-list",
  "checklist",
  "quote",
  "code-block",
  "table",
  "callout",
  "toggle",
  "bookmark",
  "embed",
  "file",
  "formula",
  "divider",
  "image",
  "mermaid",
])

export const createWriterEditorExtensions = ({
  enableMermaidBlocks = false,
}: BlockEditorFeatureOptions) => [
  StarterKit.configure({
    link: false,
    codeBlock: false,
    listItem: false,
    listKeymap: false,
  }),
  Link.configure({
    openOnClick: false,
    autolink: false,
    linkOnPaste: true,
  }),
  InlineColorMark,
  Placeholder.configure({
    placeholder: "이야기를 적고, / 또는 아래 빠른 블록으로 표·콜아웃·토글을 추가하세요...",
  }),
  EditorTable.configure({
    resizable: true,
    renderWrapper: true,
    cellMinWidth: TABLE_MIN_COLUMN_WIDTH_PX,
  }),
  EditorCodeBlock,
  RawMarkdownBlock,
  ResizableImage,
  CalloutBlock,
  EditorListItem,
  EditorTaskList,
  EditorTaskItem,
  EditorListKeymap,
  InlineFormula,
  BookmarkBlock,
  EmbedBlock,
  FileBlock,
  FormulaBlock,
  ToggleBlock,
  ...(enableMermaidBlocks ? [MermaidBlock] : []),
]

type CatalogInsertAtCursor = () => void | boolean | Promise<void>
type CatalogInsertAtBlock = (
  insertIndex: number,
  blocks: JSONContent[],
  focusBlockIndex?: number
) => void | boolean | Promise<void>

type CreateWriterBlockInsertCatalogParams = {
  canInsertTable: boolean
  createInitialTableNode: () => JSONContent
  enableMermaidBlocks?: boolean
  focusEditor: CatalogInsertAtCursor
  imageFileInputRef: MutableRefObject<HTMLInputElement | null>
  attachmentFileInputRef: MutableRefObject<HTMLInputElement | null>
  pendingImageInsertIndexRef: MutableRefObject<number | null>
  pendingAttachmentInsertIndexRef: MutableRefObject<number | null>
  insertBlocksAtCursor: (blocks: JSONContent[], placeCursorAfter?: boolean) => void | boolean
  insertBlocksAtCursorExact: (blocks: JSONContent[], placeCursorAfter?: boolean) => void | boolean
  insertBlocksAtIndex: CatalogInsertAtBlock
  insertBookmarkBlock: CatalogInsertAtCursor
  insertCalloutBlock: CatalogInsertAtCursor
  insertChecklistBlock: CatalogInsertAtCursor
  insertCodeBlock: CatalogInsertAtCursor
  insertEmbedBlock: CatalogInsertAtCursor
  insertFileBlock: CatalogInsertAtCursor
  insertFormulaBlock: CatalogInsertAtCursor
  insertMermaidBlock: CatalogInsertAtCursor
  insertTableBlock: CatalogInsertAtCursor
  insertToggleBlock: CatalogInsertAtCursor
  isTableMode: boolean
  onUploadFile?: BlockEditorUploadAdapters["onUploadFile"]
  withTrailingParagraph: (blocks: JSONContent[]) => JSONContent[]
}

export const createWriterBlockInsertCatalog = ({
  attachmentFileInputRef,
  canInsertTable,
  createInitialTableNode,
  enableMermaidBlocks = false,
  focusEditor,
  imageFileInputRef,
  insertBlocksAtCursor,
  insertBlocksAtCursorExact,
  insertBlocksAtIndex,
  insertBookmarkBlock,
  insertCalloutBlock,
  insertChecklistBlock,
  insertCodeBlock,
  insertEmbedBlock,
  insertFileBlock,
  insertFormulaBlock,
  insertMermaidBlock,
  insertTableBlock,
  insertToggleBlock,
  isTableMode,
  onUploadFile,
  pendingAttachmentInsertIndexRef,
  pendingImageInsertIndexRef,
  withTrailingParagraph,
}: CreateWriterBlockInsertCatalogParams): BlockInsertCatalogItem[] => {
  const createTableTemplate = () => createInitialTableNode()

  const createCalloutTemplate = () =>
    createCalloutNode({
      kind: "tip",
      title: "",
      body: "",
    })

  const createToggleTemplate = () =>
    createToggleNode({
      title: "",
      body: "",
    })

  const createChecklistTemplate = () => createTaskListNode([{ checked: false, text: "" }])

  const createBookmarkTemplate = () =>
    createBookmarkNode({
      url: "",
      title: "",
      description: "",
    })

  const createEmbedTemplate = () =>
    createEmbedNode({
      url: "",
      title: "",
      caption: "",
    })

  const createFileTemplate = () =>
    createFileBlockNode({
      url: "",
      name: "",
      description: "",
    })

  const createFormulaTemplate = () =>
    createFormulaNode({
      formula: "",
    })

  const catalog: BlockInsertCatalogItem[] = [
    {
      id: "paragraph",
      label: "텍스트",
      helper: "기본 본문 단락",
      section: "basic",
      keywords: ["text", "paragraph", "본문", "문단"],
      slashHint: "T",
      insertAtCursor: focusEditor,
      insertAtBlock: (blockIndex) => {
        insertBlocksAtIndex(blockIndex + 1, [createParagraphNode("")], blockIndex + 1)
      },
    },
    {
      id: "heading-1",
      label: "제목 1",
      helper: "문서 대표 제목",
      section: "basic",
      keywords: ["h1", "heading", "title", "제목"],
      slashHint: "#",
      insertAtCursor: () => insertBlocksAtCursorExact([createHeadingNode(1, "")], true),
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHeadingNode(1, "")])),
    },
    {
      id: "heading-2",
      label: "제목 2",
      helper: "큰 섹션 제목",
      section: "basic",
      keywords: ["h2", "heading", "section", "소제목"],
      slashHint: "##",
      insertAtCursor: () => insertBlocksAtCursorExact([createHeadingNode(2, "")], true),
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHeadingNode(2, "")])),
    },
    {
      id: "heading-3",
      label: "제목 3",
      helper: "작은 섹션 제목",
      section: "basic",
      keywords: ["h3", "heading", "subsection", "소제목"],
      slashHint: "###",
      insertAtCursor: () => insertBlocksAtCursorExact([createHeadingNode(3, "")], true),
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHeadingNode(3, "")])),
    },
    {
      id: "heading-4",
      label: "제목 4",
      helper: "짧은 소단락 제목",
      section: "basic",
      keywords: ["h4", "heading", "caption", "제목"],
      slashHint: "####",
      insertAtCursor: () => insertBlocksAtCursorExact([createHeadingNode(4, "")], true),
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHeadingNode(4, "")])),
    },
    {
      id: "bullet-list",
      label: "글머리 기호 목록",
      helper: "순서 없는 항목",
      section: "basic",
      keywords: ["list", "bullet", "목록", "불릿"],
      slashHint: "-",
      recommended: true,
      insertAtCursor: () => insertBlocksAtCursorExact([createBulletListNode([""])], true),
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createBulletListNode([""])])),
    },
    {
      id: "ordered-list",
      label: "번호 목록",
      helper: "순서 있는 항목",
      section: "basic",
      keywords: ["ordered", "numbered", "list", "번호"],
      slashHint: "1.",
      toolbarMore: true,
      insertAtCursor: () => insertBlocksAtCursorExact([createOrderedListNode([""])], true),
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createOrderedListNode([""])])),
    },
    {
      id: "checklist",
      label: "체크리스트",
      helper: "체크 가능한 작업 목록",
      section: "basic",
      keywords: ["checklist", "todo", "task", "체크", "할일"],
      slashHint: "☑",
      recommended: true,
      quickInsert: true,
      toolbarMore: true,
      insertAtCursor: insertChecklistBlock,
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createChecklistTemplate()])),
    },
    {
      id: "quote",
      label: "인용문",
      helper: "본문 인용",
      section: "basic",
      keywords: ["quote", "blockquote", "인용"],
      slashHint: ">",
      insertAtCursor: () => insertBlocksAtCursorExact([createBlockquoteNode("")], true),
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createBlockquoteNode("")])),
    },
    {
      id: "code-block",
      label: "코드",
      helper: "언어 지정 가능",
      section: "structure",
      keywords: ["code", "snippet", "코드블록"],
      slashHint: "</>",
      recommended: true,
      quickInsert: true,
      toolbarMore: true,
      insertAtCursor: insertCodeBlock,
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(
          blockIndex + 1,
          withTrailingParagraph([createCodeBlockNode(getPreferredCodeLanguage(), "")])
        ),
    },
    {
      id: "table",
      label: "테이블",
      helper: "3×3 빈 표",
      section: "structure",
      keywords: ["table", "표", "테이블"],
      slashHint: "표",
      recommended: true,
      quickInsert: true,
      toolbarMore: true,
      disabled: !canInsertTable,
      insertAtCursor: insertTableBlock,
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createTableTemplate()])),
    },
    {
      id: "callout",
      label: "콜아웃",
      helper: "핵심 내용을 강조합니다",
      section: "structure",
      keywords: ["callout", "tip", "note", "콜아웃"],
      slashHint: "!",
      quickInsert: true,
      toolbarMore: true,
      insertAtCursor: insertCalloutBlock,
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createCalloutTemplate()])),
    },
    {
      id: "toggle",
      label: "토글",
      helper: "긴 보충 설명을 접어 둡니다",
      section: "structure",
      keywords: ["toggle", "details", "토글", "접기"],
      slashHint: "▸",
      quickInsert: true,
      toolbarMore: true,
      insertAtCursor: insertToggleBlock,
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createToggleTemplate()])),
    },
    {
      id: "bookmark",
      label: "북마크",
      helper: "외부 링크 카드",
      section: "structure",
      keywords: ["bookmark", "link", "북마크", "링크"],
      slashHint: "↗",
      quickInsert: true,
      toolbarMore: true,
      insertAtCursor: insertBookmarkBlock,
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createBookmarkTemplate()])),
    },
    {
      id: "embed",
      label: "임베드",
      helper: "영상/외부 콘텐츠",
      section: "media",
      keywords: ["embed", "video", "youtube", "임베드"],
      slashHint: "▶",
      quickInsert: true,
      toolbarMore: true,
      insertAtCursor: insertEmbedBlock,
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createEmbedTemplate()])),
    },
    {
      id: "file",
      label: "파일",
      helper: onUploadFile ? "업로드 후 첨부 블록으로 삽입" : "다운로드 링크 블록",
      section: "media",
      keywords: ["file", "download", "첨부", "파일"],
      slashHint: "PDF",
      toolbarMore: true,
      insertAtCursor: () => (onUploadFile ? attachmentFileInputRef.current?.click() : insertFileBlock()),
      insertAtBlock: (blockIndex) => {
        if (onUploadFile) {
          pendingAttachmentInsertIndexRef.current = blockIndex + 1
          attachmentFileInputRef.current?.click()
          return
        }
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createFileTemplate()]))
      },
    },
    {
      id: "formula",
      label: "수식",
      helper: "LaTeX 스타일 블록 수식",
      section: "structure",
      keywords: ["formula", "math", "latex", "수식"],
      slashHint: "∑",
      quickInsert: true,
      toolbarMore: true,
      insertAtCursor: insertFormulaBlock,
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createFormulaTemplate()])),
    },
    {
      id: "divider",
      label: "구분선",
      helper: "섹션 구분",
      section: "structure",
      keywords: ["divider", "rule", "hr", "구분선"],
      slashHint: "---",
      recommended: true,
      toolbarMore: true,
      insertAtCursor: () => insertBlocksAtCursor([createHorizontalRuleNode()], true),
      insertAtBlock: (blockIndex) =>
        insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHorizontalRuleNode()])),
    },
    {
      id: "image",
      label: "이미지",
      helper: "업로드 후 본문에 삽입",
      section: "media",
      keywords: ["image", "photo", "img", "이미지"],
      slashHint: "img",
      recommended: true,
      quickInsert: true,
      toolbarMore: true,
      insertAtCursor: () => {
        imageFileInputRef.current?.click()
      },
      insertAtBlock: (blockIndex) => {
        pendingImageInsertIndexRef.current = blockIndex + 1
        imageFileInputRef.current?.click()
      },
    },
    ...(enableMermaidBlocks
      ? [
          {
            id: "mermaid",
            label: "다이어그램",
            helper: "Mermaid",
            section: "media" as const,
            keywords: ["diagram", "mermaid", "flowchart", "다이어그램"],
            slashHint: "MMD",
            recommended: true,
            quickInsert: true,
            toolbarMore: true,
            insertAtCursor: insertMermaidBlock,
            insertAtBlock: (blockIndex: number) =>
              insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createMermaidNode("")])),
          },
        ]
      : []),
  ]

  if (!isTableMode) return catalog

  return catalog.map((item) => {
    if (!TABLE_CONTEXT_BLOCKED_INSERT_IDS.has(item.id)) return item
    if (item.disabled) return item
    return { ...item, disabled: true }
  })
}
