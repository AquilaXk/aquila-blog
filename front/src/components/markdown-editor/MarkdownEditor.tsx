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
  EditorRoot,
  EditorToolbar,
  ToolbarGroup,
  ToolbarButton,
  ToolbarUploadButton,
  ToolbarError,
  EditorBody,
  WritePane,
  WriteEditorFrame,
  MarkdownTextarea,
  PreviewPane,
  PreviewArticle,
  PreviewHeader,
} from "./MarkdownEditor.styles"
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
import {
  blockMarkdownSnippets,
  getWheelDeltaYPixels,
  modShortcutLabel,
  toolbarMarkdownSnippets,
} from "./markdownEditorToolbarModel"

const TEXTAREA_KEYBOARD_HELP =
  "Tab은 2칸 들여쓰기, Shift+Tab은 내어쓰기입니다. Escape를 누른 다음 Tab은 포커스를 다음 요소로 이동합니다."

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
