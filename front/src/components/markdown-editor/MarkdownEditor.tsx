import {
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import styled from "@emotion/styled"
import MarkdownRenderer from "src/libs/markdown/MarkdownRenderer"

type MarkdownChangeMeta = {
  editorFocused: boolean
}

type MarkdownUploadResult = {
  alt?: string
  title?: string
  url?: string
  src?: string
}

type MarkdownEditorProps = {
  value: string
  disabled?: boolean
  disableMermaid?: boolean
  onChange: (markdown: string, meta?: MarkdownChangeMeta) => void
  onFlushMarkdownReady?: (flush: (() => string) | null) => void
  onUploadImage?: (file: File) => Promise<MarkdownUploadResult>
}

type EditorMode = "write" | "preview" | "split"

type TextareaSelection = {
  from: number
  to: number
}

const toolbarMarkdownSnippets = [
  { label: "H1", title: "제목 1", before: "# ", after: "" },
  { label: "H2", title: "제목 2", before: "## ", after: "" },
  { label: "H3", title: "제목 3", before: "### ", after: "" },
  { label: "B", title: "굵게", before: "**", after: "**" },
  { label: "I", title: "기울임", before: "_", after: "_" },
  { label: ">", title: "인용문", before: "> ", after: "" },
  { label: "List", title: "목록", before: "- ", after: "" },
  { label: "Task", title: "작업 목록", before: "- [ ] ", after: "" },
  { label: "Code", title: "인라인 코드", before: "`", after: "`" },
  { label: "Link", title: "링크", before: "[", after: "](https://)" },
] as const

const tableSnippet = [
  "",
  "| Column 1 | Column 2 | Column 3 |",
  "| --- | --- | --- |",
  "| Value | Value | Value |",
  "",
].join("\n")

const codeBlockSnippet = ["", "```", "", "```", ""].join("\n")
const mermaidSnippet = ["", "```mermaid", "flowchart LR", "    A[Admin write] --> B[DB commit]", "```", ""].join("\n")
const calloutSnippet = ["", "> [!TIP]", "> **설계 원칙**", "> 내용을 입력하세요.", ""].join("\n")
const toggleSnippet = ["", ":::toggle 자세히 보기", "내용을 입력하세요.", ":::", ""].join("\n")

const blockMarkdownSnippets = [
  { label: "Code", title: "코드 블록", snippet: codeBlockSnippet },
  { label: "Table", title: "표", snippet: tableSnippet },
  { label: "Mermaid", title: "Mermaid", snippet: mermaidSnippet, disableWhenMermaid: true },
  { label: "Callout", title: "콜아웃", snippet: calloutSnippet },
  { label: "Toggle", title: "토글", snippet: toggleSnippet },
] as const

const WHEEL_DELTA_PIXEL = 0
const WHEEL_DELTA_LINE = 1
const WHEEL_DELTA_PAGE = 2
const DEFAULT_WHEEL_LINE_HEIGHT_PX = 16

const getWheelDeltaYPixels = (event: ReactWheelEvent<HTMLElement>, element: HTMLElement) => {
  if (event.deltaMode === WHEEL_DELTA_PIXEL) return event.deltaY
  if (event.deltaMode === WHEEL_DELTA_PAGE) return event.deltaY * element.clientHeight
  if (event.deltaMode !== WHEEL_DELTA_LINE) return event.deltaY

  const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight)
  const resolvedLineHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : DEFAULT_WHEEL_LINE_HEIGHT_PX
  return event.deltaY * resolvedLineHeight
}

export const MarkdownEditor = ({
  value,
  disabled = false,
  disableMermaid = false,
  onChange,
  onFlushMarkdownReady,
  onUploadImage,
}: MarkdownEditorProps) => {
  const [mode, setMode] = useState<EditorMode>("split")
  const [uploadError, setUploadError] = useState("")
  const [draftValue, setDraftValue] = useState(value)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const previewScrollRef = useRef<HTMLElement | null>(null)
  const valueRef = useRef(value)
  const selectionRef = useRef<TextareaSelection>({ from: 0, to: 0 })

  useEffect(() => {
    if (value === valueRef.current) return
    valueRef.current = value
    setDraftValue(value)
  }, [value])

  useEffect(() => {
    onFlushMarkdownReady?.(() => valueRef.current)
    return () => onFlushMarkdownReady?.(null)
  }, [onFlushMarkdownReady])

  const commitMarkdown = useCallback(
    (nextMarkdown: string, editorFocused = false) => {
      valueRef.current = nextMarkdown
      setDraftValue(nextMarkdown)
      setUploadError("")
      onChange(nextMarkdown, { editorFocused })
    },
    [onChange]
  )

  const rememberTextareaSelection = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return selectionRef.current

    selectionRef.current = {
      from: textarea.selectionStart,
      to: textarea.selectionEnd,
    }
    return selectionRef.current
  }, [])

  const setTextareaSelection = useCallback((from: number, to = from) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const length = valueRef.current.length
    const nextSelection = {
      from: Math.max(0, Math.min(from, length)),
      to: Math.max(0, Math.min(to, length)),
    }
    textarea.setSelectionRange(nextSelection.from, nextSelection.to)
    selectionRef.current = nextSelection
  }, [])

  const syncScrollPosition = useCallback((source: HTMLElement, target: HTMLElement | null) => {
    if (!target) return

    const sourceMax = source.scrollHeight - source.clientHeight
    const targetMax = target.scrollHeight - target.clientHeight
    if (sourceMax <= 0 || targetMax <= 0) return

    const ratio = source.scrollTop / sourceMax
    const nextScrollTop = ratio * targetMax
    if (Math.abs(target.scrollTop - nextScrollTop) < 1) return

    target.scrollTop = nextScrollTop
  }, [])

  const handleWriteScroll = useCallback(
    (event: ReactUIEvent<HTMLTextAreaElement>) => {
      syncScrollPosition(event.currentTarget, previewScrollRef.current)
    },
    [syncScrollPosition]
  )

  const handlePreviewScroll = useCallback(
    (event: ReactUIEvent<HTMLElement>) => {
      syncScrollPosition(event.currentTarget, textareaRef.current)
    },
    [syncScrollPosition]
  )

  const handlePreviewWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (event.deltaY === 0) return

    const preview = event.currentTarget
    const deltaYPixels = getWheelDeltaYPixels(event, preview)
    const maxScrollTop = preview.scrollHeight - preview.clientHeight
    const nextScrollTop = preview.scrollTop + deltaYPixels
    if (nextScrollTop >= 0 && nextScrollTop <= maxScrollTop) return

    event.preventDefault()

    const clampedScrollTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop))
    const remainingDeltaY = nextScrollTop - clampedScrollTop
    preview.scrollTop = clampedScrollTop
    if (remainingDeltaY === 0) return

    window.scrollBy({
      top: remainingDeltaY,
    })
  }, [])

  const handleTextareaKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.shiftKey || (!event.metaKey && !event.ctrlKey)) return

      if (event.key === "Home") {
        event.preventDefault()
        setTextareaSelection(0)
        return
      }

      if (event.key === "End") {
        event.preventDefault()
        setTextareaSelection(valueRef.current.length)
      }
    },
    [setTextareaSelection]
  )

  const insertMarkdownAtEditorSelection = useCallback(
    (before: string, after = "") => {
      const textarea = textareaRef.current
      if (!textarea || disabled) return false

      const { from: selectionStart, to: selectionEnd } =
        document.activeElement === textarea ? rememberTextareaSelection() : selectionRef.current
      const selectedMarkdown = valueRef.current.slice(selectionStart, selectionEnd)
      const insertedMarkdown = `${before}${selectedMarkdown}${after}`
      const nextCursorFrom = selectionStart + before.length
      const nextCursorTo = nextCursorFrom + selectedMarkdown.length
      const nextMarkdown = `${valueRef.current.slice(0, selectionStart)}${insertedMarkdown}${valueRef.current.slice(selectionEnd)}`

      commitMarkdown(nextMarkdown, true)
      window.requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(nextCursorFrom, nextCursorTo)
      })
      return true
    },
    [commitMarkdown, disabled, rememberTextareaSelection]
  )

  const applySnippet = useCallback(
    (before: string, after = "") => {
      if (insertMarkdownAtEditorSelection(before, after)) return
      commitMarkdown(`${valueRef.current}${before}${after}`, true)
    },
    [commitMarkdown, insertMarkdownAtEditorSelection]
  )

  const handleImageInput = useCallback(
    async (file: File | null) => {
      if (!file || !onUploadImage) return
      let uploaded: MarkdownUploadResult
      try {
        uploaded = await onUploadImage(file)
      } catch {
        setUploadError("이미지 업로드에 실패했습니다.")
        return
      }
      const src = uploaded.url || uploaded.src || ""
      if (!src) {
        setUploadError("이미지 업로드 결과 URL을 확인할 수 없습니다.")
        return
      }
      const alt = uploaded.alt || uploaded.title || file.name
      const imageMarkdown = `\n\n![${alt}](${src})\n`
      if (insertMarkdownAtEditorSelection(imageMarkdown)) return
      commitMarkdown(`${valueRef.current}${imageMarkdown}`, true)
    },
    [commitMarkdown, insertMarkdownAtEditorSelection, onUploadImage]
  )

  return (
    <EditorRoot data-testid="markdown-editor">
      <EditorToolbar aria-label="Markdown 작성 도구">
        <ToolbarGroup>
          {toolbarMarkdownSnippets.map((snippet) => (
            <ToolbarButton
              key={snippet.title}
              type="button"
              title={snippet.title}
              aria-label={snippet.title}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applySnippet(snippet.before, snippet.after)}
            >
              {snippet.label}
            </ToolbarButton>
          ))}
          {blockMarkdownSnippets.map((snippet) => (
            <ToolbarButton
              key={snippet.title}
              type="button"
              aria-label={snippet.title}
              disabled={disabled || ("disableWhenMermaid" in snippet && disableMermaid)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applySnippet(snippet.snippet)}
            >
              {snippet.label}
            </ToolbarButton>
          ))}
          <ImageUploadButton>
            Image
            <input
              type="file"
              accept="image/*"
              disabled={disabled || !onUploadImage}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null
                void handleImageInput(file)
                event.currentTarget.value = ""
              }}
            />
          </ImageUploadButton>
        </ToolbarGroup>
        <ModeTabs role="tablist" aria-label="Markdown editor mode">
          <ModeTab type="button" role="tab" aria-selected={mode === "write"} onClick={() => setMode("write")}>
            Write
          </ModeTab>
          <ModeTab type="button" role="tab" aria-selected={mode === "preview"} onClick={() => setMode("preview")}>
            Preview
          </ModeTab>
          <ModeTab type="button" role="tab" aria-selected={mode === "split"} onClick={() => setMode("split")}>
            Split
          </ModeTab>
        </ModeTabs>
      </EditorToolbar>
      {uploadError ? <ToolbarError role="alert">{uploadError}</ToolbarError> : null}
      <EditorBody data-mode={mode}>
        {mode !== "preview" ? (
          <WritePane data-pane="write" data-testid="markdown-editor-write-pane">
            <WriteEditorFrame data-testid="markdown-textarea-frame">
              <MarkdownTextarea
                ref={textareaRef}
                aria-label="Markdown 본문"
                spellCheck={false}
                disabled={disabled}
                value={draftValue}
                onChange={(event) => {
                  selectionRef.current = {
                    from: event.currentTarget.selectionStart,
                    to: event.currentTarget.selectionEnd,
                  }
                  commitMarkdown(event.currentTarget.value, true)
                }}
                onFocus={rememberTextareaSelection}
                onKeyDown={handleTextareaKeyDown}
                onKeyUp={rememberTextareaSelection}
                onMouseUp={rememberTextareaSelection}
                onSelect={rememberTextareaSelection}
                onScroll={handleWriteScroll}
              />
            </WriteEditorFrame>
          </WritePane>
        ) : null}
        {mode !== "write" ? (
          <PreviewPane data-pane="preview" data-testid="markdown-editor-preview-pane">
            <PreviewArticle
              ref={previewScrollRef}
              data-testid="markdown-editor-preview-scroll"
              onScroll={handlePreviewScroll}
              onWheel={handlePreviewWheel}
            >
              <MarkdownRenderer content={value} disableMermaid={disableMermaid} />
            </PreviewArticle>
          </PreviewPane>
        ) : null}
      </EditorBody>
    </EditorRoot>
  )
}

const EditorRoot = styled.section`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 0;
  overflow: hidden;
  background: ${({ theme }) => theme.publicDesign.readableSurface};
  color: ${({ theme }) => theme.colors.gray12};
`

const EditorToolbar = styled.div`
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.55rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.publicDesign.readableSurface};
  flex-wrap: wrap;
`

const ModeTabs = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.publicDesign.surfaceElevated};
`

const ModeTab = styled.button`
  border: 0;
  border-left: 1px solid ${({ theme }) => theme.colors.gray6};
  min-height: 28px;
  padding: 0 0.62rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.72rem;
  font-weight: 750;
  cursor: pointer;

  &:first-of-type {
    border-left: 0;
  }

  &[aria-selected="true"] {
    background: ${({ theme }) => theme.colors.gray12};
    color: ${({ theme }) => theme.colors.gray1};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.blue8};
    outline-offset: 2px;
  }
`

const ToolbarGroup = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.12rem;
  flex-wrap: wrap;
`

const ToolbarButton = styled.button`
  border: 0;
  border-radius: 4px;
  min-height: 30px;
  padding: 0 0.52rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const ImageUploadButton = styled.label`
  border-radius: 4px;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  padding: 0 0.52rem;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  input {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    pointer-events: none;
  }
`

const ToolbarError = styled.div`
  padding: 0.55rem 0.85rem;
  border-bottom: 1px solid rgba(248, 81, 73, 0.35);
  background: rgba(248, 81, 73, 0.1);
  color: #ffb4ad;
  font-size: 0.86rem;
  font-weight: 600;
`

const EditorBody = styled.div`
  min-height: min(720px, calc(100vh - 260px));
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);

  &[data-mode="write"],
  &[data-mode="preview"] {
    grid-template-columns: minmax(0, 1fr);
  }

  @media (max-width: 980px) {
    grid-template-columns: minmax(0, 1fr);
  }

  @media (max-width: 768px) {
    &[data-mode="split"] [data-pane="preview"] {
      display: none;
    }

    &[data-mode="split"] [data-pane="write"] {
      border-bottom: 0;
    }
  }
`

const WritePane = styled.div`
  min-width: 0;
  min-height: min(720px, calc(100vh - 260px));
  border-right: 1px solid ${({ theme }) => theme.colors.gray6};

  @media (max-width: 980px) {
    border-right: 0;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  }
`

const WriteEditorFrame = styled.div`
  min-height: min(720px, calc(100vh - 260px));
  background: #0f1728;
  color: #dbe7ff;
`

const MarkdownTextarea = styled.textarea`
  width: 100%;
  min-height: min(720px, calc(100vh - 260px));
  max-width: none;
  padding: 2rem;
  border: 0;
  outline: none;
  resize: vertical;
  background: #0f1728;
  color: #dbe7ff;
  caret-color: #dbe7ff;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 14px;
  line-height: 1.55;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  &::selection {
    background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(56, 139, 253, 0.45)" : "rgba(9, 105, 218, 0.24)")};
  }

  &:focus,
  &:focus-visible {
    outline: 0;
    box-shadow: none;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
`

const PreviewPane = styled.div`
  min-width: 0;
  height: min(720px, calc(100vh - 260px));
  min-height: min(720px, calc(100vh - 260px));
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.publicDesign.readableSurface};
`

const PreviewArticle = styled.article`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 2rem;
  background: ${({ theme }) => theme.publicDesign.readableSurface};

  .aq-markdown {
    width: min(100%, var(--article-readable-width, 48rem));
    max-width: var(--article-readable-width, 48rem);
    margin-top: 0;
    margin-inline: auto;
    color: ${({ theme }) => theme.colors.gray12};
  }

  .aq-markdown > :first-child {
    margin-top: 0;
  }

  @media (max-width: 980px) {
    padding-inline: 1rem;
  }
`
