import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
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
  { label: "H", title: "제목", before: "## ", after: "" },
  { label: "B", title: "굵게", before: "**", after: "**" },
  { label: "I", title: "기울임", before: "_", after: "_" },
  { label: "Quote", title: "인용문", before: "> ", after: "" },
  { label: "Code", title: "코드", before: "`", after: "`" },
  { label: "Link", title: "링크", before: "[", after: "](https://)" },
  { label: "List", title: "목록", before: "- ", after: "" },
  { label: "Task", title: "작업 목록", before: "- [ ] ", after: "" },
] as const

const tableSnippet = [
  "",
  "| Column 1 | Column 2 | Column 3 |",
  "| --- | --- | --- |",
  "| Value | Value | Value |",
  "",
].join("\n")

const codeBlockSnippet = ["", "```", "", "```", ""].join("\n")

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
  const valueRef = useRef(value)
  const selectionRef = useRef<TextareaSelection>({ from: 0, to: 0 })
  const lineNumbers = useMemo(
    () => Array.from({ length: Math.max(1, draftValue.split("\n").length) }, (_, index) => index + 1),
    [draftValue]
  )

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
      commitMarkdown(`${valueRef.current}\n\n![${alt}](${src})\n`, true)
    },
    [commitMarkdown, onUploadImage]
  )

  return (
    <EditorRoot data-testid="markdown-editor">
      <EditorToolbar aria-label="Markdown 작성 도구">
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
          <ToolbarButton
            type="button"
            aria-label="코드 블록"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applySnippet(codeBlockSnippet)}
          >
            Code block
          </ToolbarButton>
          <ToolbarButton
            type="button"
            aria-label="표"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applySnippet(tableSnippet)}
          >
            Table
          </ToolbarButton>
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
      </EditorToolbar>
      {uploadError ? <ToolbarError role="alert">{uploadError}</ToolbarError> : null}
      <EditorBody data-mode={mode}>
        {mode !== "preview" ? (
          <WritePane data-pane="write" data-testid="markdown-editor-write-pane">
            <WriteEditorFrame data-testid="markdown-textarea-frame">
              <LineNumberGutter aria-hidden="true" data-testid="markdown-line-number-gutter">
                {lineNumbers.map((lineNumber) => (
                  <span key={lineNumber}>{lineNumber}</span>
                ))}
              </LineNumberGutter>
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
              />
            </WriteEditorFrame>
          </WritePane>
        ) : null}
        {mode !== "write" ? (
          <PreviewPane data-pane="preview" data-testid="markdown-editor-preview-pane">
            <PreviewHeader>Preview</PreviewHeader>
            <PreviewArticle>
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
  border-radius: 6px;
  overflow: hidden;
  background: ${({ theme }) => theme.publicDesign.readableSurface};
  color: ${({ theme }) => theme.colors.gray12};
`

const EditorToolbar = styled.div`
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  flex-wrap: wrap;
`

const ModeTabs = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
`

const ModeTab = styled.button`
  border: 1px solid transparent;
  border-radius: 6px;
  min-height: 32px;
  padding: 0 0.75rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;

  &[aria-selected="true"] {
    background: ${({ theme }) => theme.publicDesign.readableSurface};
    border-color: ${({ theme }) => theme.colors.gray6};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.blue8};
    outline-offset: 2px;
  }
`

const ToolbarGroup = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.25rem;
  flex-wrap: wrap;
`

const ToolbarButton = styled.button`
  border: 0;
  border-radius: 6px;
  min-height: 32px;
  padding: 0 0.58rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.78rem;
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
  border-radius: 6px;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  padding: 0 0.58rem;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.78rem;
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
  min-height: 640px;
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
  min-height: 640px;
  border-right: 1px solid ${({ theme }) => theme.colors.gray6};

  @media (max-width: 980px) {
    border-right: 0;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  }
`

const WriteEditorFrame = styled.div`
  display: grid;
  grid-template-columns: 2.75rem minmax(0, 1fr);
  min-height: 640px;
  background: ${({ theme }) => theme.publicDesign.readableSurface};
  color: ${({ theme }) => theme.colors.gray12};
`

const LineNumberGutter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
  padding: 16px 0.62rem 16px 0.4rem;
  border-right: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.publicDesign.readableSurface};
  color: ${({ theme }) => theme.colors.gray10};
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 14px;
  line-height: 1.55;
  user-select: none;

  span {
    height: 1.55em;
  }
`

const MarkdownTextarea = styled.textarea`
  width: 100%;
  min-height: 640px;
  max-width: var(--article-readable-width, 48rem);
  padding: 16px;
  border: 0;
  outline: none;
  resize: vertical;
  background: ${({ theme }) => theme.publicDesign.readableSurface};
  color: ${({ theme }) => theme.colors.gray12};
  caret-color: ${({ theme }) => theme.colors.gray12};
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 14px;
  line-height: 1.55;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  &::selection {
    background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(56, 139, 253, 0.45)" : "rgba(9, 105, 218, 0.24)")};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
`

const PreviewPane = styled.div`
  min-width: 0;
  min-height: 640px;
  background: ${({ theme }) => theme.publicDesign.readableSurface};
`

const PreviewHeader = styled.div`
  height: 42px;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.8rem;
  font-weight: 700;
`

const PreviewArticle = styled.article`
  padding: 0 1rem 2rem;
  background: ${({ theme }) => theme.publicDesign.readableSurface};

  .aq-markdown {
    width: min(100%, var(--article-readable-width, 48rem));
    max-width: var(--article-readable-width, 48rem);
    margin-inline: auto;
    color: ${({ theme }) => theme.colors.gray12};
  }

  @media (max-width: 980px) {
    padding-inline: 1rem;
  }
`
