import {
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import styled from "@emotion/styled"
import MarkdownRenderer from "src/libs/markdown/MarkdownRenderer"
import {
  isComposingEditorKeyboardEvent,
  isSaveShortcut,
  planFormatShortcutMutation,
  planHardBreak,
  planListEnterContinuation,
  planTabIndentMutation,
  resolveFormatShortcut,
} from "./markdownEditorKeyboardModel"
import { MarkdownEditorModeTabs, type MarkdownEditorMode } from "./markdownEditorModeTabs"
import {
  applyPlannedTextMutation,
  planToggleWrapSelection,
  planWrapSelection,
  type PlannedTextMutation,
} from "./markdownEditorTextMutation"
import {
  MARKDOWN_ATTACHMENT_UPLOAD_FAILED_MESSAGE,
  MARKDOWN_IMAGE_UPLOAD_FAILED_MESSAGE,
  resolveMarkdownAttachmentLink,
  resolveMarkdownImageEmbed,
  validateMarkdownAttachmentSize,
  type MarkdownFileUploadResult,
  type MarkdownImageUploadResult,
} from "./markdownEditorUploadModel"

type MarkdownChangeMeta = {
  editorFocused: boolean
}

type MarkdownEditorProps = {
  value: string
  previewTitle?: string
  previewSummary?: string
  disabled?: boolean
  disableMermaid?: boolean
  onChange: (markdown: string, meta?: MarkdownChangeMeta) => void
  onFlushMarkdownReady?: (flush: (() => string) | null) => void
  onFocusRequestReady?: (focus: (() => void) | null) => void
  onRequestSave?: () => void
  onUploadingChange?: (isUploading: boolean) => void
  onUploadImage?: (file: File) => Promise<MarkdownImageUploadResult>
  onUploadFile?: (file: File) => Promise<MarkdownFileUploadResult>
}

type TextareaSelection = {
  from: number
  to: number
}

const TEXTAREA_KEYBOARD_HELP =
  "Tab은 2칸 들여쓰기, Shift+Tab은 내어쓰기입니다. Escape를 누른 다음 Tab은 포커스를 다음 요소로 이동합니다."

const modShortcutLabel =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
    ? "⌘"
    : "Ctrl+"

const toolbarMarkdownSnippets = [
  { label: "H1", title: "제목 1", before: "# ", after: "" },
  { label: "H2", title: "제목 2", before: "## ", after: "" },
  { label: "H3", title: "제목 3", before: "### ", after: "" },
  { label: "B", title: `굵게 (${modShortcutLabel}B)`, before: "**", after: "**", toggle: true },
  { label: "I", title: `기울임 (${modShortcutLabel}I)`, before: "_", after: "_", toggle: true },
  { label: "S", title: `취소선 (${modShortcutLabel}Shift+X)`, before: "~~", after: "~~", toggle: true },
  { label: "`", title: `인라인 코드 (${modShortcutLabel}E)`, before: "`", after: "`", toggle: true },
  { label: ">", title: "인용문", before: "> ", after: "" },
  { label: "List", title: "목록", before: "- ", after: "" },
  { label: "Task", title: "작업 목록", before: "- [ ] ", after: "" },
] as const

const tableSnippet = [
  "",
  "| 항목 | 설명 |",
  "| --- | --- |",
  "| 값 | 내용 |",
  "",
].join("\n")

const codeBlockSnippet = ["", '```kotlin title="invalidatePost.kt"', "fun example() = Unit", "```", ""].join("\n")
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
  previewTitle = "",
  previewSummary = "",
  disabled = false,
  disableMermaid = false,
  onChange,
  onFlushMarkdownReady,
  onFocusRequestReady,
  onRequestSave,
  onUploadingChange,
  onUploadImage,
  onUploadFile,
}: MarkdownEditorProps) => {
  const [mode, setMode] = useState<MarkdownEditorMode>("split")
  const [uploadError, setUploadError] = useState("")
  const [draftValue, setDraftValue] = useState(value)
  const editorDomId = useId()
  const writePanelId = `${editorDomId}-write-panel`
  const previewPanelId = `${editorDomId}-preview-panel`
  const writeTabId = `${editorDomId}-write-tab`
  const previewTabId = `${editorDomId}-preview-tab`
  const splitTabId = `${editorDomId}-split-tab`
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const previewScrollRef = useRef<HTMLDivElement | null>(null)
  const valueRef = useRef(value)
  const selectionRef = useRef<TextareaSelection>({ from: 0, to: 0 })
  const uploadInFlightCountRef = useRef(0)
  const allowNativeTabAfterEscapeRef = useRef(false)

  const setUploadInFlight = useCallback(
    (delta: number) => {
      uploadInFlightCountRef.current = Math.max(0, uploadInFlightCountRef.current + delta)
      onUploadingChange?.(uploadInFlightCountRef.current > 0)
    },
    [onUploadingChange]
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

  useEffect(() => {
    onFocusRequestReady?.(() => {
      const textarea = textareaRef.current
      if (!textarea || disabled) return
      textarea.focus()
    })
    return () => onFocusRequestReady?.(null)
  }, [disabled, onFocusRequestReady])

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

  const applyMutationPlan = useCallback(
    (plan: PlannedTextMutation) => {
      const textarea = textareaRef.current
      if (!textarea || disabled) return false
      textarea.focus()
      const nextMarkdown = applyPlannedTextMutation(textarea, plan)
      selectionRef.current = { from: plan.selectionStart, to: plan.selectionEnd }
      commitMarkdown(nextMarkdown, true)
      return true
    },
    [commitMarkdown, disabled]
  )

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

  const resolveActiveSelection = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea && document.activeElement === textarea) {
      return rememberTextareaSelection()
    }
    return selectionRef.current
  }, [rememberTextareaSelection])

  const insertMarkdownAtEditorSelection = useCallback(
    (before: string, after = "", options?: { toggle?: boolean }) => {
      const textarea = textareaRef.current
      if (!textarea || disabled) return false

      const { from: selectionStart, to: selectionEnd } = resolveActiveSelection()
      const plan = options?.toggle
        ? planToggleWrapSelection(valueRef.current, selectionStart, selectionEnd, before, after)
        : planWrapSelection(valueRef.current, selectionStart, selectionEnd, before, after)

      return applyMutationPlan(plan)
    },
    [applyMutationPlan, disabled, resolveActiveSelection]
  )

  const applySnippet = useCallback(
    (before: string, after = "", options?: { toggle?: boolean }) => {
      if (insertMarkdownAtEditorSelection(before, after, options)) return
      commitMarkdown(`${valueRef.current}${before}${after}`, true)
    },
    [commitMarkdown, insertMarkdownAtEditorSelection]
  )

  const insertUploadedMarkdown = useCallback(
    (markdown: string) => {
      if (insertMarkdownAtEditorSelection(markdown)) return
      commitMarkdown(`${valueRef.current}${markdown}`, true)
    },
    [commitMarkdown, insertMarkdownAtEditorSelection]
  )

  const handleTextareaKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled || isComposingEditorKeyboardEvent(event)) return

      if (event.key === "Escape") {
        allowNativeTabAfterEscapeRef.current = true
        return
      }

      if (event.key === "Tab") {
        if (allowNativeTabAfterEscapeRef.current) {
          allowNativeTabAfterEscapeRef.current = false
          return
        }
        const { from, to } = rememberTextareaSelection()
        const tabPlan = planTabIndentMutation(valueRef.current, from, to, event.shiftKey)
        if (!tabPlan) {
          if (event.shiftKey) return
          event.preventDefault()
          return
        }
        event.preventDefault()
        applyMutationPlan(tabPlan)
        return
      }

      if (event.key !== "Escape" && event.key !== "Tab") {
        allowNativeTabAfterEscapeRef.current = false
      }

      if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault()
        const { from, to } = rememberTextareaSelection()
        applyMutationPlan(planHardBreak(from, to))
        return
      }

      if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const { from, to } = rememberTextareaSelection()
        const listPlan = planListEnterContinuation(valueRef.current, from, to)
        if (listPlan) {
          event.preventDefault()
          applyMutationPlan(listPlan)
        }
        return
      }

      if (isSaveShortcut(event)) {
        if (!onRequestSave) return
        event.preventDefault()
        onRequestSave()
        return
      }

      const formatShortcut = resolveFormatShortcut(event)
      if (formatShortcut) {
        event.preventDefault()
        const { from, to } = rememberTextareaSelection()
        applyMutationPlan(planFormatShortcutMutation(valueRef.current, from, to, formatShortcut))
        return
      }

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
    [applyMutationPlan, disabled, onRequestSave, rememberTextareaSelection, setTextareaSelection]
  )

  const handleImageInput = useCallback(
    async (file: File | null) => {
      if (!file || !onUploadImage) return
      setUploadInFlight(1)
      let uploaded: MarkdownImageUploadResult
      try {
        uploaded = await onUploadImage(file)
      } catch {
        setUploadError(MARKDOWN_IMAGE_UPLOAD_FAILED_MESSAGE)
        return
      } finally {
        setUploadInFlight(-1)
      }
      const resolved = resolveMarkdownImageEmbed(uploaded, file.name)
      if ("error" in resolved) {
        setUploadError(resolved.error)
        return
      }
      insertUploadedMarkdown(resolved.markdown)
    },
    [insertUploadedMarkdown, onUploadImage, setUploadInFlight]
  )

  const handleFileInput = useCallback(
    async (file: File | null) => {
      if (!file || !onUploadFile) return
      const sizeError = validateMarkdownAttachmentSize(file)
      if (sizeError) {
        setUploadError(sizeError)
        return
      }

      setUploadInFlight(1)
      let uploaded: MarkdownFileUploadResult
      try {
        uploaded = await onUploadFile(file)
      } catch {
        setUploadError(MARKDOWN_ATTACHMENT_UPLOAD_FAILED_MESSAGE)
        return
      } finally {
        setUploadInFlight(-1)
      }

      const resolved = resolveMarkdownAttachmentLink(uploaded, file.name)
      if ("error" in resolved) {
        setUploadError(resolved.error)
        return
      }
      insertUploadedMarkdown(resolved.markdown)
    },
    [insertUploadedMarkdown, onUploadFile, setUploadInFlight]
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
              onClick={() =>
                applySnippet(snippet.before, snippet.after, {
                  toggle: "toggle" in snippet && snippet.toggle,
                })
              }
            >
              {snippet.label}
            </ToolbarButton>
          ))}
          {blockMarkdownSnippets.map((snippet) => (
            <ToolbarButton
              key={snippet.title}
              type="button"
              title={snippet.title}
              aria-label={snippet.title}
              disabled={disabled || ("disableWhenMermaid" in snippet && disableMermaid)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applySnippet(snippet.snippet)}
            >
              {snippet.label}
            </ToolbarButton>
          ))}
          <ToolbarUploadButton title="이미지" aria-label="이미지" aria-disabled={disabled || !onUploadImage}>
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
          </ToolbarUploadButton>
          <ToolbarUploadButton title="파일" aria-label="파일" aria-disabled={disabled || !onUploadFile}>
            File
            <input
              type="file"
              disabled={disabled || !onUploadFile}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null
                void handleFileInput(file)
                event.currentTarget.value = ""
              }}
            />
          </ToolbarUploadButton>
          <ToolbarButton
            type="button"
            title={`링크 (${modShortcutLabel}K)`}
            aria-label={`링크 (${modShortcutLabel}K)`}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const { from, to } = resolveActiveSelection()
              applyMutationPlan(planFormatShortcutMutation(valueRef.current, from, to, "link"))
            }}
          >
            Link
          </ToolbarButton>
        </ToolbarGroup>
        <MarkdownEditorModeTabs
          mode={mode}
          onModeChange={setMode}
          writePanelId={writePanelId}
          previewPanelId={previewPanelId}
          writeTabId={writeTabId}
          previewTabId={previewTabId}
          splitTabId={splitTabId}
        />
      </EditorToolbar>
      {uploadError ? <ToolbarError role="alert">{uploadError}</ToolbarError> : null}
      <EditorBody data-mode={mode}>
        {mode !== "preview" ? (
          <WritePane
            id={writePanelId}
            role="tabpanel"
            aria-labelledby={mode === "split" ? `${writeTabId} ${splitTabId}` : writeTabId}
            data-pane="write"
            data-testid="markdown-editor-write-pane"
          >
            <WriteEditorFrame data-testid="markdown-textarea-frame">
              <MarkdownTextarea
                ref={textareaRef}
                aria-label="Markdown 본문"
                aria-description={TEXTAREA_KEYBOARD_HELP}
                title={TEXTAREA_KEYBOARD_HELP}
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
          <PreviewPane
            id={previewPanelId}
            role="tabpanel"
            aria-labelledby={mode === "split" ? `${previewTabId} ${splitTabId}` : previewTabId}
            ref={previewScrollRef}
            data-pane="preview"
            data-testid="markdown-editor-preview-pane"
            aria-label="Markdown 미리보기"
            tabIndex={0}
            onScroll={handlePreviewScroll}
            onWheel={handlePreviewWheel}
          >
            <PreviewArticle data-testid="markdown-editor-preview-scroll">
              {previewTitle || previewSummary ? (
                <PreviewHeader>
                  <span>Public preview</span>
                  {previewTitle ? <h1>{previewTitle}</h1> : null}
                  {previewSummary ? <p>{previewSummary}</p> : null}
                </PreviewHeader>
              ) : null}
              <MarkdownRenderer content={value} disableMermaid={disableMermaid} />
            </PreviewArticle>
          </PreviewPane>
        ) : null}
      </EditorBody>
    </EditorRoot>
  )
}

const EditorRoot = styled.section`
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 0;
  overflow: hidden;
  background: ${({ theme }) => theme.publicDesign.readableSurface};
  color: ${({ theme }) => theme.colors.gray12};
`

const EditorToolbar = styled.div`
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.publicDesign.readableSurface};

  @media (max-width: 820px) {
    align-items: flex-start;
    flex-direction: column;
  }
`

const ToolbarGroup = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;

  @media (max-width: 820px) {
    width: 100%;
  }
`

const ToolbarButton = styled.button`
  border: 1px solid transparent;
  border-radius: 4px;
  height: 31px;
  min-width: 31px;
  padding: 0 8px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.publicDesign.surfaceElevated};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const ToolbarUploadButton = styled.label`
  border: 1px solid transparent;
  border-radius: 4px;
  height: 31px;
  min-width: 31px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  color: ${({ theme }) => theme.colors.gray10};
  font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  cursor: pointer;

  &:hover:not([aria-disabled="true"]) {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.publicDesign.surfaceElevated};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &[aria-disabled="true"] {
    opacity: 0.45;
    cursor: not-allowed;
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
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  background: ${({ theme }) => theme.publicDesign.readableSurface};

  &[data-mode="write"],
  &[data-mode="preview"] {
    grid-template-columns: minmax(0, 1fr);
  }

  &[data-mode="preview"] [data-testid="markdown-editor-preview-scroll"] {
    max-width: 820px;
  }

  @media (max-width: 1100px) {
    grid-template-columns: minmax(0, 1fr);

    &[data-mode="split"] [data-pane="write"] {
      height: 46vh;
      border-right: 0;
      border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    }

    &[data-mode="split"] [data-pane="preview"] {
      height: auto;
    }
  }
`

const WritePane = styled.div`
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: auto;
  border-right: 1px solid ${({ theme }) => theme.colors.gray6};
  background: #0f1728;
`

const WriteEditorFrame = styled.div`
  min-height: 100%;
  background: #0f1728;
  color: #dbe7ff;
`

const MarkdownTextarea = styled.textarea`
  width: 100%;
  height: 100%;
  min-height: 640px;
  max-width: none;
  padding: 30px 32px;
  border: 0;
  outline: none;
  resize: none;
  background: #0f1728;
  color: #d9e4f7;
  caret-color: #dbe7ff;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.78;
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

  @media (max-width: 820px) {
    padding: 22px 18px;
  }
`

const PreviewPane = styled.div`
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: ${({ theme }) => theme.publicDesign.readableSurface};
`

const PreviewArticle = styled.article`
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 44px 110px;
  background: ${({ theme }) => theme.publicDesign.readableSurface};

  .aq-markdown {
    width: min(100%, 760px);
    max-width: 760px;
    margin-top: 0;
    margin-inline: auto;
    color: ${({ theme }) => theme.colors.gray12};
  }

  .aq-markdown > :first-child {
    margin-top: 0;
  }

  @media (max-width: 820px) {
    padding: 34px 20px 90px;
  }
`

const PreviewHeader = styled.header`
  width: min(100%, 760px);
  max-width: 760px;
  margin: 0 auto 34px;

  span {
    display: block;
    margin-bottom: 14px;
    color: ${({ theme }) => theme.publicDesign.accent};
    font: 750 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 12px 0 18px;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 43px;
    font-weight: 850;
    line-height: 1.13;
    letter-spacing: -0.055em;
  }

  p {
    margin: 0;
    padding: 4px 0 4px 20px;
    border-left: 3px solid ${({ theme }) => theme.publicDesign.accent};
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 18px;
    line-height: 1.75;
  }
`
