import styled from "@emotion/styled"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { Table } from "@tiptap/extension-table"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import TableRow from "@tiptap/extension-table-row"
import StarterKit from "@tiptap/starter-kit"
import { EditorContent, useEditor } from "@tiptap/react"
import {
  ChangeEvent,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  CalloutBlock,
  MermaidBlock,
  RawMarkdownBlock,
  ResizableImage,
  ToggleBlock,
} from "./extensions"
import {
  parseMarkdownToEditorDoc,
  serializeEditorDocToMarkdown,
  type BlockEditorDoc,
  type ImageBlockAttrs,
} from "./serialization"

type Props = {
  value: string
  onChange: (markdown: string) => void
  onUploadImage: (file: File) => Promise<ImageBlockAttrs>
  disabled?: boolean
  className?: string
  preview?: ReactNode
  enableMermaidBlocks?: boolean
}

type SlashAction = {
  id: string
  label: string
  helper?: string
  run: () => void | Promise<void>
}

type ToolbarAction = {
  id: string
  label: string
  run: () => void
  active: boolean
}

const RAW_BLOCK_PLACEHOLDER = "```text\n원문 블록\n```"
const MERMAID_RAW_PLACEHOLDER = "```mermaid\nflowchart TD\n  A[시작] --> B[처리]\n```"
const CODE_LANGUAGE_OPTIONS = [
  "text",
  "bash",
  "shell",
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "json",
  "yaml",
  "kotlin",
  "java",
  "sql",
  "html",
  "css",
  "markdown",
  "mermaid",
] as const

const normalizeMarkdown = (value: string) => value.replace(/\r\n?/g, "\n").trim()

const downgradeDisabledFeatureNodes = (node: BlockEditorDoc, enableMermaidBlocks: boolean): BlockEditorDoc => {
  if (!enableMermaidBlocks && node.type === "mermaidBlock") {
    const source = String(node.attrs?.source || "").trim()
    return {
      type: "rawMarkdownBlock",
      attrs: {
        markdown: ["```mermaid", source, "```"].join("\n"),
        reason: "unsupported-mermaid",
      },
    }
  }

  if (!node.content?.length) return node

  return {
    ...node,
    content: node.content.map((child) => downgradeDisabledFeatureNodes(child as BlockEditorDoc, enableMermaidBlocks)),
  }
}

const BlockEditorShell = ({
  value,
  onChange,
  onUploadImage,
  disabled = false,
  className,
  preview,
  enableMermaidBlocks = false,
}: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastCommittedMarkdownRef = useRef(normalizeMarkdown(value))
  const [rawMarkdownDraft, setRawMarkdownDraft] = useState(value)
  const [isRawMarkdownOpen, setIsRawMarkdownOpen] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false)
  const [, setSelectionTick] = useState(0)
  const initialDocRef = useRef(
    downgradeDisabledFeatureNodes(parseMarkdownToEditorDoc(value), enableMermaidBlocks)
  )

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: false,
        linkOnPaste: true,
      }),
      Placeholder.configure({
        placeholder: "당신의 이야기를 블록 단위로 정리해보세요...",
      }),
      Table.configure({
        resizable: false,
      }),
      TableRow,
      TableHeader,
      TableCell,
      RawMarkdownBlock,
      ResizableImage,
      CalloutBlock,
      ToggleBlock,
      ...(enableMermaidBlocks ? [MermaidBlock] : []),
    ],
    content: initialDocRef.current,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "aq-block-editor__content",
      },
      handleKeyDown: (_, event) => {
        if (
          event.key === "/" &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey &&
          editor?.isActive("paragraph") &&
          editor.state.selection.empty &&
          editor.state.selection.$from.parent.textContent.length === 0
        ) {
          event.preventDefault()
          setIsSlashMenuOpen(true)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      const markdown = serializeEditorDocToMarkdown(nextEditor.getJSON() as BlockEditorDoc)
      const normalized = normalizeMarkdown(markdown)
      lastCommittedMarkdownRef.current = normalized
      setRawMarkdownDraft(markdown)
      onChange(markdown)
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor) return
    const notifySelection = () => setSelectionTick((prev) => prev + 1)
    editor.on("selectionUpdate", notifySelection)
    editor.on("transaction", notifySelection)
    return () => {
      editor.off("selectionUpdate", notifySelection)
      editor.off("transaction", notifySelection)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const normalizedIncoming = normalizeMarkdown(value)
    if (normalizedIncoming === lastCommittedMarkdownRef.current) {
      setRawMarkdownDraft(value)
      return
    }

    const nextDoc = downgradeDisabledFeatureNodes(parseMarkdownToEditorDoc(value), enableMermaidBlocks)
    editor.commands.setContent(nextDoc, { emitUpdate: false })
    lastCommittedMarkdownRef.current = normalizeMarkdown(serializeEditorDocToMarkdown(nextDoc))
    setRawMarkdownDraft(value)
  }, [editor, enableMermaidBlocks, value])

  const focusEditor = useCallback(() => {
    editor?.chain().focus().run()
    setIsSlashMenuOpen(false)
  }, [editor])

  const insertParagraphAfterBlock = useCallback((block: BlockEditorDoc) => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertContent([block, { type: "paragraph" }])
      .run()
    setIsSlashMenuOpen(false)
  }, [editor])

  const insertRawMarkdownBlock = useCallback(
    (markdown = RAW_BLOCK_PLACEHOLDER, reason = "manual-raw") => {
      insertParagraphAfterBlock({
        type: "rawMarkdownBlock",
        attrs: {
          markdown,
          reason,
        },
      })
      setIsRawMarkdownOpen(false)
    },
    [insertParagraphAfterBlock]
  )

  const insertMermaidBlock = useCallback(() => {
    if (enableMermaidBlocks) {
      insertParagraphAfterBlock({
        type: "mermaidBlock",
        attrs: {
          source: "flowchart TD\n  A[시작] --> B[처리]",
        },
      })
      return
    }

    insertRawMarkdownBlock(MERMAID_RAW_PLACEHOLDER, "unsupported-mermaid")
  }, [enableMermaidBlocks, insertParagraphAfterBlock, insertRawMarkdownBlock])

  const insertCalloutBlock = useCallback(() => {
    insertParagraphAfterBlock({
      type: "calloutBlock",
      attrs: {
        kind: "tip",
        title: "핵심 포인트",
        body: "콜아웃 본문을 입력하세요.",
      },
    })
  }, [insertParagraphAfterBlock])

  const insertToggleBlock = useCallback(() => {
    insertParagraphAfterBlock({
      type: "toggleBlock",
      attrs: {
        title: "더 보기",
        body: "토글 내부 본문을 입력하세요.",
      },
    })
  }, [insertParagraphAfterBlock])

  const applyRawMarkdownDraft = useCallback(() => {
    if (!editor) return
    const nextDoc = downgradeDisabledFeatureNodes(parseMarkdownToEditorDoc(rawMarkdownDraft), enableMermaidBlocks)
    const serialized = serializeEditorDocToMarkdown(nextDoc)
    editor.commands.setContent(nextDoc, { emitUpdate: false })
    lastCommittedMarkdownRef.current = normalizeMarkdown(serialized)
    setRawMarkdownDraft(serialized)
    onChange(serialized)
  }, [editor, enableMermaidBlocks, onChange, rawMarkdownDraft])

  const openLinkPrompt = useCallback(() => {
    if (!editor || typeof window === "undefined") return
    const previousHref = String(editor.getAttributes("link").href || "")
    const href = window.prompt("링크 주소를 입력하세요.", previousHref)
    if (href === null) return
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run()
  }, [editor])

  const handleImageInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !editor) return

    const imageAttrs = await onUploadImage(file)
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "resizableImage",
          attrs: {
            src: imageAttrs.src,
            alt: imageAttrs.alt || "",
            title: imageAttrs.title || "",
            widthPx: imageAttrs.widthPx ?? null,
            align: imageAttrs.align || "center",
          },
        },
        { type: "paragraph" },
      ])
      .run()
  }

  const slashActions = useMemo<SlashAction[]>(() => {
    if (!editor) return []

    return [
      {
        id: "heading-2",
        label: "제목 2",
        helper: "큰 섹션 제목",
        run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        id: "heading-3",
        label: "제목 3",
        helper: "작은 섹션 제목",
        run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        id: "bullet-list",
        label: "불릿 리스트",
        helper: "순서 없는 항목",
        run: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        id: "ordered-list",
        label: "번호 리스트",
        helper: "순서 있는 항목",
        run: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        id: "quote",
        label: "인용문",
        helper: "본문 인용",
        run: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        id: "code-block",
        label: "코드 블록",
        helper: "언어 지정 가능",
        run: () => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        id: "table",
        label: "테이블",
        helper: "2열 헤더 포함",
        run: () => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(),
      },
      {
        id: "callout",
        label: "콜아웃",
        helper: "TIP/INFO/WARNING",
        run: insertCalloutBlock,
      },
      {
        id: "toggle",
        label: "토글",
        helper: "접기/펼치기 블록",
        run: insertToggleBlock,
      },
      {
        id: "mermaid",
        label: "Mermaid",
        helper: enableMermaidBlocks ? "다이어그램 블록" : "원문 블록으로 보존",
        run: insertMermaidBlock,
      },
      {
        id: "image",
        label: "이미지",
        helper: "업로드 후 즉시 삽입",
        run: () => fileInputRef.current?.click(),
      },
      {
        id: "divider",
        label: "구분선",
        helper: "섹션 구분",
        run: () => editor.chain().focus().setHorizontalRule().run(),
      },
      {
        id: "raw",
        label: "원문 블록",
        helper: "지원되지 않는 markdown 유지",
        run: () => insertRawMarkdownBlock(),
      },
    ]
  }, [editor, enableMermaidBlocks, insertCalloutBlock, insertMermaidBlock, insertRawMarkdownBlock, insertToggleBlock])

  const toolbarActions: ToolbarAction[] = [
    { id: "paragraph", label: "본문", run: () => editor?.chain().focus().setParagraph().run(), active: editor?.isActive("paragraph") ?? false },
    { id: "heading-2", label: "H2", run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: editor?.isActive("heading", { level: 2 }) ?? false },
    { id: "heading-3", label: "H3", run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), active: editor?.isActive("heading", { level: 3 }) ?? false },
    { id: "bullet-list", label: "목록", run: () => editor?.chain().focus().toggleBulletList().run(), active: editor?.isActive("bulletList") ?? false },
    { id: "ordered-list", label: "번호", run: () => editor?.chain().focus().toggleOrderedList().run(), active: editor?.isActive("orderedList") ?? false },
    { id: "quote", label: "인용", run: () => editor?.chain().focus().toggleBlockquote().run(), active: editor?.isActive("blockquote") ?? false },
    { id: "code-block", label: "코드", run: () => editor?.chain().focus().toggleCodeBlock().run(), active: editor?.isActive("codeBlock") ?? false },
    { id: "table", label: "테이블", run: () => editor?.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(), active: editor?.isActive("table") ?? false },
    { id: "callout", label: "콜아웃", run: insertCalloutBlock, active: editor?.isActive("calloutBlock") ?? false },
    { id: "toggle", label: "토글", run: insertToggleBlock, active: editor?.isActive("toggleBlock") ?? false },
    { id: "mermaid", label: "Mermaid", run: insertMermaidBlock, active: enableMermaidBlocks ? editor?.isActive("mermaidBlock") ?? false : false },
    { id: "link", label: "링크", run: openLinkPrompt, active: editor?.isActive("link") ?? false },
    { id: "divider", label: "구분선", run: () => editor?.chain().focus().setHorizontalRule().run(), active: false },
    { id: "raw", label: "원문", run: () => insertRawMarkdownBlock(), active: editor?.isActive("rawMarkdownBlock") ?? false },
  ]

  const activeCodeLanguage = ((editor?.getAttributes("codeBlock").language as string | undefined) || "").trim()
  const isCodeBlockActive = editor?.isActive("codeBlock") ?? false

  const updateCodeBlockLanguage = useCallback(
    (nextLanguage: string) => {
      if (!editor) return
      const normalizedLanguage = nextLanguage.trim()
      editor.chain().focus().updateAttributes("codeBlock", { language: normalizedLanguage || null }).run()
    },
    [editor]
  )

  const handleSlashMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      setIsSlashMenuOpen(false)
      focusEditor()
    }
  }

  return (
    <Shell className={className}>
      <Toolbar>
        <ToolbarHint>
          <strong>블록 작성기</strong>
          <span>
            콜아웃·토글은 직접 편집하고, Mermaid는 {enableMermaidBlocks ? "미리보기 블록" : "원문 블록"}으로 다룹니다.
          </span>
        </ToolbarHint>
        <ToolbarActions>
          {toolbarActions.map((action) => (
            <ToolbarButton
              key={action.id}
              type="button"
              data-active={action.active}
              onClick={() => action.run()}
              disabled={disabled}
            >
              {action.label}
            </ToolbarButton>
          ))}
          <ToolbarButton type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
            이미지
          </ToolbarButton>
        </ToolbarActions>
        {isCodeBlockActive ? (
          <InlineControlRow>
            <InlineControlLabel htmlFor="block-editor-code-language">코드 언어</InlineControlLabel>
            <InlineControlInput
              id="block-editor-code-language"
              list="block-editor-code-language-options"
              value={activeCodeLanguage}
              onChange={(event) => updateCodeBlockLanguage(event.target.value)}
              placeholder="예: typescript"
            />
            <datalist id="block-editor-code-language-options">
              {CODE_LANGUAGE_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </InlineControlRow>
        ) : null}
      </Toolbar>

      <HiddenFileInput
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(event) => {
          void handleImageInputChange(event)
        }}
      />

      {isSlashMenuOpen ? (
        <SlashMenu role="dialog" aria-label="블록 삽입 메뉴" onKeyDown={handleSlashMenuKeyDown}>
          <SlashMenuHeader>
            <strong>/ 블록 메뉴</strong>
            <button type="button" onClick={() => setIsSlashMenuOpen(false)}>
              닫기
            </button>
          </SlashMenuHeader>
          <SlashMenuGrid>
            {slashActions.map((action) => (
              <SlashActionButton
                key={action.id}
                type="button"
                onClick={() => {
                  void action.run()
                  setIsSlashMenuOpen(false)
                }}
              >
                <strong>{action.label}</strong>
                {action.helper ? <span>{action.helper}</span> : null}
              </SlashActionButton>
            ))}
          </SlashMenuGrid>
        </SlashMenu>
      ) : null}

      <EditorViewport>
        <EditorContent editor={editor} />
      </EditorViewport>

      <AuxDisclosure open={isRawMarkdownOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault()
            setIsRawMarkdownOpen((prev) => !prev)
          }}
        >
          <strong>고급 markdown 직접 편집</strong>
          <span>{isRawMarkdownOpen ? "닫기" : "열기"}</span>
        </summary>
        {isRawMarkdownOpen ? (
          <div className="body">
            <RawMarkdownTextarea
              value={rawMarkdownDraft}
              onChange={(event) => setRawMarkdownDraft(event.target.value)}
              spellCheck={false}
            />
            <RawMarkdownActions>
              <RawMarkdownButton type="button" onClick={applyRawMarkdownDraft}>
                원문 반영
              </RawMarkdownButton>
              <RawMarkdownButton type="button" data-variant="ghost" onClick={() => setRawMarkdownDraft(value)}>
                원문 되돌리기
              </RawMarkdownButton>
            </RawMarkdownActions>
          </div>
        ) : null}
      </AuxDisclosure>

      {preview ? (
        <AuxDisclosure open={isPreviewOpen}>
          <summary
            onClick={(event) => {
              event.preventDefault()
              setIsPreviewOpen((prev) => !prev)
            }}
          >
            <strong>공개 결과 미리보기</strong>
            <span>{isPreviewOpen ? "닫기" : "열기"}</span>
          </summary>
          {isPreviewOpen ? <div className="body">{preview}</div> : null}
        </AuxDisclosure>
      ) : null}
    </Shell>
  )
}

export default BlockEditorShell

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`

const Toolbar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1.1rem;
  background: rgba(18, 21, 26, 0.94);
`

const ToolbarHint = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  strong {
    font-size: 0.95rem;
    color: var(--color-gray12);
  }

  span {
    font-size: 0.84rem;
    color: var(--color-gray10);
  }
`

const ToolbarActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
`

const ToolbarButton = styled.button`
  min-height: 2.1rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(13, 15, 18, 0.94);
  color: var(--color-gray11);
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0 0.9rem;

  &[data-active="true"] {
    border-color: rgba(59, 130, 246, 0.52);
    background: rgba(37, 99, 235, 0.16);
    color: #93c5fd;
  }
`

const InlineControlRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
`

const InlineControlLabel = styled.label`
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-gray10);
`

const InlineControlInput = styled.input`
  min-height: 2.2rem;
  min-width: min(16rem, 100%);
  border-radius: 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(13, 15, 18, 0.94);
  color: var(--color-gray12);
  font-size: 0.84rem;
  padding: 0 0.85rem;
`

const HiddenFileInput = styled.input`
  display: none;
`

const SlashMenu = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid rgba(59, 130, 246, 0.22);
  border-radius: 1rem;
  background: rgba(18, 21, 26, 0.97);
`

const SlashMenuHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;

  strong {
    font-size: 0.92rem;
    color: var(--color-gray12);
  }

  button {
    border: 0;
    background: transparent;
    color: var(--color-gray10);
    font-size: 0.84rem;
    font-weight: 700;
  }
`

const SlashMenuGrid = styled.div`
  display: grid;
  gap: 0.6rem;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
`

const SlashActionButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.3rem;
  min-height: 4rem;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(13, 15, 18, 0.94);
  color: var(--color-gray12);
  padding: 0.9rem 1rem;
  text-align: left;

  strong {
    font-size: 0.9rem;
  }

  span {
    font-size: 0.8rem;
    color: var(--color-gray10);
  }
`

const EditorViewport = styled.div`
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1.25rem;
  background: rgba(13, 15, 18, 0.96);
  overflow: hidden;

  .aq-block-editor__content {
    min-height: 32rem;
    padding: 2rem;
    color: var(--color-gray12);
    font-size: 1rem;
    line-height: 1.75;
    outline: none;
  }

  .aq-block-editor__content > * {
    width: min(100%, var(--compose-pane-readable-width, var(--article-readable-width, 48rem)));
    margin-left: auto;
    margin-right: auto;
  }

  .aq-block-editor__content > * + * {
    margin-top: 1rem;
  }

  .aq-block-editor__content p.is-editor-empty:first-of-type::before {
    content: attr(data-placeholder);
    color: var(--color-gray10);
    float: left;
    height: 0;
    pointer-events: none;
  }

  .aq-block-editor__content h1,
  .aq-block-editor__content h2,
  .aq-block-editor__content h3 {
    line-height: 1.25;
  }

  .aq-block-editor__content pre {
    overflow: auto;
    border-radius: 1rem;
    background: #0f1220;
    color: #dbe4f0;
    padding: 1rem 1.1rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: 0.88rem;
    line-height: 1.65;
  }

  .aq-block-editor__content code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
  }

  .aq-block-editor__content table {
    width: 100%;
    border-collapse: collapse;
  }

  .aq-block-editor__content th,
  .aq-block-editor__content td {
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0.7rem 0.8rem;
    text-align: left;
    vertical-align: top;
  }
`

const AuxDisclosure = styled.details`
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  background: rgba(18, 21, 26, 0.92);

  > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    cursor: pointer;
    list-style: none;
    padding: 0.95rem 1rem;

    &::-webkit-details-marker {
      display: none;
    }
  }

  strong {
    font-size: 0.9rem;
    color: var(--color-gray12);
  }

  span {
    font-size: 0.82rem;
    color: var(--color-gray10);
  }

  .body {
    padding: 0 1rem 1rem;
  }
`

const RawMarkdownTextarea = styled.textarea`
  min-height: 14rem;
  width: 100%;
  resize: vertical;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.95rem;
  background: rgba(10, 12, 16, 0.92);
  color: var(--color-gray12);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.88rem;
  line-height: 1.65;
  padding: 1rem;
`

const RawMarkdownActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 0.85rem;
`

const RawMarkdownButton = styled.button`
  min-height: 2.25rem;
  border-radius: 999px;
  border: 1px solid rgba(59, 130, 246, 0.24);
  background: rgba(37, 99, 235, 0.18);
  color: #93c5fd;
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0 1rem;

  &[data-variant="ghost"] {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(13, 15, 18, 0.94);
    color: var(--color-gray11);
  }
`
