import CodeMirror from "@uiw/react-codemirror"
import { markdown } from "@codemirror/lang-markdown"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdownLanguage } from "@codemirror/lang-markdown"
import { EditorState, type Extension } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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

type GitHubMarkdownEditorProps = {
  value: string
  disabled?: boolean
  disableMermaid?: boolean
  onChange: (markdown: string, meta?: MarkdownChangeMeta) => void
  onFlushMarkdownReady?: (flush: (() => string) | null) => void
  onUploadImage?: (file: File) => Promise<MarkdownUploadResult>
}

type EditorMode = "write" | "preview" | "split"

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

const markdownEditorTheme: Extension = EditorView.theme({
  "&": {
    minHeight: "100%",
    backgroundColor: "#0d1117",
    color: "#e6edf3",
    fontSize: "14px",
  },
  ".cm-scroller": {
    fontFamily:
      "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
    lineHeight: "1.55",
  },
  ".cm-content": {
    minHeight: "560px",
    padding: "16px",
    caretColor: "#e6edf3",
  },
  ".cm-gutters": {
    backgroundColor: "#0d1117",
    borderRight: "1px solid #30363d",
    color: "#7d8590",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(110, 118, 129, 0.12)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(110, 118, 129, 0.12)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "rgba(56, 139, 253, 0.45)",
  },
})

export const GitHubMarkdownEditor = ({
  value,
  disabled = false,
  disableMermaid = false,
  onChange,
  onFlushMarkdownReady,
  onUploadImage,
}: GitHubMarkdownEditorProps) => {
  const [mode, setMode] = useState<EditorMode>("split")
  const editorViewRef = useRef<EditorView | null>(null)
  const extensions = useMemo(
    () => [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      EditorState.tabSize.of(2),
      markdownEditorTheme,
      EditorView.editable.of(!disabled),
    ],
    [disabled]
  )

  useEffect(() => {
    onFlushMarkdownReady?.(() => value)
    return () => onFlushMarkdownReady?.(null)
  }, [onFlushMarkdownReady, value])

  const commitMarkdown = useCallback(
    (nextMarkdown: string, editorFocused = false) => {
      onChange(nextMarkdown, { editorFocused })
    },
    [onChange]
  )

  const insertMarkdownAtEditorSelection = useCallback(
    (before: string, after = "") => {
      const editorView = editorViewRef.current
      if (!editorView || disabled) return false

      const selection = editorView.state.selection.main
      const selectedMarkdown = editorView.state.sliceDoc(selection.from, selection.to)
      const insertedMarkdown = `${before}${selectedMarkdown}${after}`
      const nextCursorFrom = selection.from + before.length
      const nextCursorTo = nextCursorFrom + selectedMarkdown.length

      editorView.dispatch({
        changes: { from: selection.from, to: selection.to, insert: insertedMarkdown },
        selection: { anchor: nextCursorFrom, head: nextCursorTo },
        scrollIntoView: true,
      })
      editorView.focus()
      commitMarkdown(editorView.state.doc.toString(), true)
      return true
    },
    [commitMarkdown, disabled]
  )

  const applySnippet = useCallback(
    (before: string, after = "") => {
      if (insertMarkdownAtEditorSelection(before, after)) return
      commitMarkdown(`${value}${before}${after}`, true)
    },
    [commitMarkdown, insertMarkdownAtEditorSelection, value]
  )

  const handleImageInput = useCallback(
    async (file: File | null) => {
      if (!file || !onUploadImage) return
      const uploaded = await onUploadImage(file)
      const src = uploaded.url || uploaded.src || ""
      if (!src) return
      const alt = uploaded.alt || uploaded.title || file.name
      commitMarkdown(`${value}\n\n![${alt}](${src})\n`, true)
    },
    [commitMarkdown, onUploadImage, value]
  )

  return (
    <EditorRoot data-testid="github-markdown-editor">
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
              onClick={() => applySnippet(snippet.before, snippet.after)}
            >
              {snippet.label}
            </ToolbarButton>
          ))}
          <ToolbarButton
            type="button"
            aria-label="코드 블록"
            disabled={disabled}
            onClick={() => applySnippet(codeBlockSnippet)}
          >
            Code block
          </ToolbarButton>
          <ToolbarButton
            type="button"
            aria-label="표"
            disabled={disabled}
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
      <EditorBody data-mode={mode}>
        {mode !== "preview" ? (
          <WritePane data-testid="github-markdown-write-pane">
            <CodeMirror
              value={value}
              height="100%"
              basicSetup={{
                foldGutter: false,
                highlightActiveLine: true,
                highlightSelectionMatches: false,
              }}
              extensions={extensions}
              onCreateEditor={(editorView) => {
                editorViewRef.current = editorView
              }}
              onChange={(nextValue) => commitMarkdown(nextValue, true)}
            />
          </WritePane>
        ) : null}
        {mode !== "write" ? (
          <PreviewPane data-testid="github-markdown-preview-pane">
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
  border: 1px solid #30363d;
  border-radius: 6px;
  overflow: hidden;
  background: #0d1117;
  color: #e6edf3;
`

const EditorToolbar = styled.div`
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem;
  border-bottom: 1px solid #30363d;
  background: #161b22;
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
  color: #7d8590;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;

  &[aria-selected="true"] {
    background: #0d1117;
    border-color: #30363d;
    color: #e6edf3;
  }

  &:focus-visible {
    outline: 2px solid #2f81f7;
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
  color: #7d8590;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #21262d;
    color: #e6edf3;
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
  color: #7d8590;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    background: #21262d;
    color: #e6edf3;
  }

  input {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    pointer-events: none;
  }
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
`

const WritePane = styled.div`
  min-width: 0;
  min-height: 640px;
  border-right: 1px solid #30363d;

  @media (max-width: 980px) {
    border-right: 0;
    border-bottom: 1px solid #30363d;
  }
`

const PreviewPane = styled.div`
  min-width: 0;
  min-height: 640px;
  background: #0d1117;
`

const PreviewHeader = styled.div`
  height: 42px;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  border-bottom: 1px solid #30363d;
  color: #7d8590;
  font-size: 0.8rem;
  font-weight: 700;
`

const PreviewArticle = styled.article`
  padding: 1.25rem 1.4rem 2rem;
  background: #0d1117;

  .aq-markdown {
    color: #e6edf3;
  }
`
