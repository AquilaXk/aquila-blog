import { useCallback, useEffect, useId, useRef, useState } from "react"
import MarkdownRenderer from "src/libs/markdown/MarkdownRenderer"
import { planFormatShortcutMutation } from "./markdownEditorKeyboardModel"
import {
  MarkdownEditorModeTabs,
  resolveModeForBodyFocus,
  resolveModeForToolbarInsert,
  type MarkdownEditorMode,
} from "./markdownEditorModeTabs"
import {
  DEFAULT_MARKDOWN_EDITOR_MODE,
  readMarkdownEditorModePreference,
  writeMarkdownEditorModePreference,
} from "./markdownEditorModePreference"
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
  applyPlannedTextMutationToValue,
  planToggleWrapSelection,
  planWrapSelection,
  type PlannedTextMutation,
} from "./markdownEditorTextMutation"
import { planInsertBlockSnippet, type BlockSnippetSpec } from "./markdownEditorBlockSnippets"
import {
  emptyPendingToolbarInsertQueue,
  queuePendingToolbarInsert,
  resolvePendingToolbarInsertAfterFlushSkip,
  resolvePendingToolbarInsertWhenModeChanges,
  shouldSchedulePendingToolbarInsertFlush,
  type PendingToolbarInsert,
  type PendingToolbarInsertQueue,
} from "./markdownEditorPendingToolbarInsert"
import {
  type MarkdownFileUploadResult,
  type MarkdownImageUploadResult,
} from "./markdownEditorUploadModel"
import { blockMarkdownSnippets, modShortcutLabel, toolbarMarkdownSnippets } from "./markdownEditorToolbarModel"
import { useMarkdownEditorMediaTransfers } from "./useMarkdownEditorMediaTransfers"
import { useMarkdownEditorScrollSync } from "./useMarkdownEditorScrollSync"
import { useMarkdownEditorTextareaKeyboard } from "./useMarkdownEditorTextareaKeyboard"

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
  const [mode, setMode] = useState<MarkdownEditorMode>(DEFAULT_MARKDOWN_EDITOR_MODE)
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
  const modeRef = useRef<MarkdownEditorMode>(mode)
  const pendingBodyFocusRef = useRef(false)
  const pendingToolbarInsertQueueRef = useRef<PendingToolbarInsertQueue>(emptyPendingToolbarInsertQueue())
  modeRef.current = mode

  const setUploadInFlight = useCallback(
    (delta: number) => {
      uploadInFlightCountRef.current = Math.max(0, uploadInFlightCountRef.current + delta)
      onUploadingChange?.(uploadInFlightCountRef.current > 0)
    },
    [onUploadingChange]
  )

  useEffect(() => {
    setMode((current) => {
      const storedMode = readMarkdownEditorModePreference()
      return current === storedMode ? current : storedMode
    })
  }, [])

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
      if (disabled) return
      const nextMode = resolveModeForBodyFocus(modeRef.current)
      if (nextMode !== modeRef.current) {
        pendingBodyFocusRef.current = true
        setMode(nextMode)
        return
      }
      const textarea = textareaRef.current
      if (textarea) {
        textarea.focus()
        return
      }
      pendingBodyFocusRef.current = true
    })
    return () => onFocusRequestReady?.(null)
  }, [disabled, onFocusRequestReady])

  useEffect(() => {
    if (!pendingBodyFocusRef.current || disabled || mode === "preview") return
    const frame = window.requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      pendingBodyFocusRef.current = false
      textarea.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [disabled, mode])

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
      const nextFrom = plan.selectionStart
      const nextTo = plan.selectionEnd
      window.requestAnimationFrame(() => {
        const current = textareaRef.current
        if (!current) return
        current.focus()
        current.setSelectionRange(nextFrom, nextTo)
        selectionRef.current = { from: nextFrom, to: nextTo }
      })
      return true
    },
    [commitMarkdown, disabled]
  )

  const { handleWriteScroll, handlePreviewScroll, handlePreviewWheel } = useMarkdownEditorScrollSync({
    textareaRef,
    previewScrollRef,
  })

  const resolveActiveSelection = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea && document.activeElement === textarea) {
      return rememberTextareaSelection()
    }
    return selectionRef.current
  }, [rememberTextareaSelection])

  const applyPlannedMarkdownMutation = useCallback(
    (plan: PlannedTextMutation) => {
      if (applyMutationPlan(plan)) return true

      const next = applyPlannedTextMutationToValue(valueRef.current, plan)
      selectionRef.current = { from: next.selectionStart, to: next.selectionEnd }
      commitMarkdown(next.value, true)
      return true
    },
    [applyMutationPlan, commitMarkdown]
  )

  /** Async upload placeholder swap/remove — keep undo via setRangeText, never steal focus. */
  const applyBackgroundMarkdownMutation = useCallback(
    (plan: PlannedTextMutation) => {
      if (disabled) return false
      const textarea = textareaRef.current
      const wasFocused = Boolean(textarea && document.activeElement === textarea)
      if (textarea) {
        const nextMarkdown = applyPlannedTextMutation(textarea, plan)
        selectionRef.current = { from: plan.selectionStart, to: plan.selectionEnd }
        commitMarkdown(nextMarkdown, wasFocused)
        if (wasFocused) {
          const nextFrom = plan.selectionStart
          const nextTo = plan.selectionEnd
          window.requestAnimationFrame(() => {
            const current = textareaRef.current
            if (!current || document.activeElement !== current) return
            current.setSelectionRange(nextFrom, nextTo)
            selectionRef.current = { from: nextFrom, to: nextTo }
          })
        }
        return true
      }

      const next = applyPlannedTextMutationToValue(valueRef.current, plan)
      selectionRef.current = { from: next.selectionStart, to: next.selectionEnd }
      commitMarkdown(next.value, false)
      return true
    },
    [commitMarkdown, disabled]
  )

  const planPendingToolbarInsert = useCallback(
    (insert: PendingToolbarInsert): PlannedTextMutation => {
      const { from, to } = resolveActiveSelection()

      if (insert.kind === "block") {
        return planInsertBlockSnippet(from, to, insert.spec)
      }

      if (insert.kind === "format") {
        return planFormatShortcutMutation(valueRef.current, from, to, insert.shortcut)
      }

      return insert.toggle
        ? planToggleWrapSelection(valueRef.current, from, to, insert.before, insert.after)
        : planWrapSelection(valueRef.current, from, to, insert.before, insert.after)
    },
    [resolveActiveSelection]
  )

  const clearPendingToolbarInsert = useCallback(() => {
    pendingToolbarInsertQueueRef.current = emptyPendingToolbarInsertQueue()
  }, [])

  const flushPendingToolbarInsert = useCallback(() => {
    const queue = pendingToolbarInsertQueueRef.current
    if (!queue.pending) return

    if (disabled) {
      pendingToolbarInsertQueueRef.current = resolvePendingToolbarInsertAfterFlushSkip(queue, "disabled")
      return
    }

    if (modeRef.current === "preview") {
      pendingToolbarInsertQueueRef.current = resolvePendingToolbarInsertAfterFlushSkip(queue, "preview")
      return
    }

    const textarea = textareaRef.current
    if (!textarea) {
      const nextQueue = resolvePendingToolbarInsertAfterFlushSkip(queue, "missing-textarea")
      pendingToolbarInsertQueueRef.current = nextQueue
      if (shouldSchedulePendingToolbarInsertFlush(nextQueue)) {
        window.requestAnimationFrame(() => {
          flushPendingToolbarInsert()
        })
      }
      return
    }

    const pending = queue.pending
    clearPendingToolbarInsert()
    applyPlannedMarkdownMutation(planPendingToolbarInsert(pending))
  }, [applyPlannedMarkdownMutation, clearPendingToolbarInsert, disabled, planPendingToolbarInsert])

  const queueToolbarInsertForPreviewMode = useCallback((insert: PendingToolbarInsert) => {
      pendingToolbarInsertQueueRef.current = queuePendingToolbarInsert(insert)
      setMode(resolveModeForToolbarInsert(modeRef.current))
  }, [])

  useEffect(() => {
    pendingToolbarInsertQueueRef.current = resolvePendingToolbarInsertWhenModeChanges(
      pendingToolbarInsertQueueRef.current,
      mode
    )
  }, [mode])

  useEffect(() => {
    if (!disabled) return
    pendingToolbarInsertQueueRef.current = resolvePendingToolbarInsertAfterFlushSkip(
      pendingToolbarInsertQueueRef.current,
      "disabled"
    )
  }, [disabled])

  useEffect(() => {
    if (disabled || mode === "preview") return
    if (!shouldSchedulePendingToolbarInsertFlush(pendingToolbarInsertQueueRef.current)) return

    const frame = window.requestAnimationFrame(() => {
      flushPendingToolbarInsert()
    })
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [disabled, flushPendingToolbarInsert, mode])

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

  const handleModeChange = useCallback((nextMode: MarkdownEditorMode) => {
    setMode(nextMode)
    writeMarkdownEditorModePreference(nextMode)
  }, [])

  const applyBlockSnippet = useCallback(
    (spec: BlockSnippetSpec) => {
      if (disabled) return

      if (modeRef.current === "preview") {
        queueToolbarInsertForPreviewMode({ kind: "block", spec })
        return
      }

      const { from, to } = resolveActiveSelection()
      applyPlannedMarkdownMutation(planInsertBlockSnippet(from, to, spec))
    },
    [applyPlannedMarkdownMutation, disabled, queueToolbarInsertForPreviewMode, resolveActiveSelection]
  )

  const applySnippet = useCallback(
    (before: string, after = "", options?: { toggle?: boolean }) => {
      if (disabled) return

      if (modeRef.current === "preview") {
        queueToolbarInsertForPreviewMode({ kind: "wrap", before, after, toggle: options?.toggle })
        return
      }

      if (insertMarkdownAtEditorSelection(before, after, options)) return

      const { from, to } = resolveActiveSelection()
      const plan = options?.toggle
        ? planToggleWrapSelection(valueRef.current, from, to, before, after)
        : planWrapSelection(valueRef.current, from, to, before, after)
      applyPlannedMarkdownMutation(plan)
    },
    [
      applyPlannedMarkdownMutation,
      disabled,
      insertMarkdownAtEditorSelection,
      queueToolbarInsertForPreviewMode,
      resolveActiveSelection,
    ]
  )

  const applyFormatShortcutOrAppend = useCallback(
    (shortcut: Parameters<typeof planFormatShortcutMutation>[3]) => {
      if (disabled) return

      if (modeRef.current === "preview") {
        queueToolbarInsertForPreviewMode({ kind: "format", shortcut })
        return
      }

      const { from, to } = resolveActiveSelection()
      applyPlannedMarkdownMutation(planFormatShortcutMutation(valueRef.current, from, to, shortcut))
    },
    [applyPlannedMarkdownMutation, disabled, queueToolbarInsertForPreviewMode, resolveActiveSelection]
  )

  const insertUploadedMarkdown = useCallback(
    (markdown: string) => {
      if (insertMarkdownAtEditorSelection(markdown)) return
      commitMarkdown(`${valueRef.current}${markdown}`, true)
    },
    [commitMarkdown, insertMarkdownAtEditorSelection]
  )

  const { handleImageInput, handleFileInput, handlePaste, handleDragOver, handleDrop } =
    useMarkdownEditorMediaTransfers({
      disabled,
      valueRef,
      selectionRef,
      onUploadImage,
      onUploadFile,
      applyPlannedMarkdownMutation,
      applyBackgroundMarkdownMutation,
      resolveActiveSelection,
      setUploadInFlight,
      setUploadError,
      insertUploadedMarkdown,
    })

  const { handleTextareaKeyDown } = useMarkdownEditorTextareaKeyboard({
    disabled,
    valueRef,
    allowNativeTabAfterEscapeRef,
    rememberTextareaSelection,
    applyMutationPlan,
    setTextareaSelection,
    onRequestSave,
  })

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
              onClick={() => applyBlockSnippet(snippet)}
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
            onClick={() => applyFormatShortcutOrAppend("link")}
          >
            Link
          </ToolbarButton>
        </ToolbarGroup>
        <MarkdownEditorModeTabs
          mode={mode}
          onModeChange={handleModeChange}
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
                onPaste={handlePaste}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
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
