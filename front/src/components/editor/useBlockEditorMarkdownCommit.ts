import type { Editor as TiptapEditor } from "@tiptap/core"
import { useCallback, useRef } from "react"
import type { BlockEditorChangeMeta } from "./blockEditorContract"
import {
  serializeEditorDocToMarkdown,
  type BlockEditorDoc,
} from "./serialization"
import { flushPendingNodeViewAttributeCommits } from "./editorNodeViewCommitRegistry"

const MARKDOWN_COMMIT_DEBOUNCE_MS = 140
const MARKDOWN_COMMIT_IDLE_TIMEOUT_MS = 220
const MARKDOWN_COMMIT_MAX_WAIT_MS = 700

export const normalizeEditorMarkdown = (value: string) =>
  value.replace(/\r\n?/g, "\n").trim()

type UseBlockEditorMarkdownCommitOptions = {
  value: string
  onChange: (markdown: string, meta?: BlockEditorChangeMeta) => void
}

export const useBlockEditorMarkdownCommit = ({
  value,
  onChange,
}: UseBlockEditorMarkdownCommitOptions) => {
  const lastCommittedMarkdownRef = useRef(normalizeEditorMarkdown(value))
  const pendingCommitEditorRef = useRef<TiptapEditor | null>(null)
  const pendingCommitFocusedRef = useRef(false)
  const markdownCommitIdleHandleRef = useRef<number | null>(null)
  const markdownCommitIdleModeRef = useRef<"idle" | "timeout" | null>(null)
  const markdownCommitTimerRef = useRef<number | null>(null)
  const markdownCommitMaxWaitTimerRef = useRef<number | null>(null)

  const cancelPendingMarkdownCommit = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      markdownCommitIdleHandleRef.current !== null
    ) {
      const idleWindow = window as Window & {
        cancelIdleCallback?: (id: number) => void
      }
      if (
        markdownCommitIdleModeRef.current === "idle" &&
        typeof idleWindow.cancelIdleCallback === "function"
      ) {
        idleWindow.cancelIdleCallback(markdownCommitIdleHandleRef.current)
      } else {
        window.clearTimeout(markdownCommitIdleHandleRef.current)
      }
      markdownCommitIdleHandleRef.current = null
      markdownCommitIdleModeRef.current = null
    }
    if (
      markdownCommitTimerRef.current !== null &&
      typeof window !== "undefined"
    ) {
      window.clearTimeout(markdownCommitTimerRef.current)
      markdownCommitTimerRef.current = null
    }
  }, [])

  const clearPendingMarkdownCommitMaxWait = useCallback(() => {
    if (
      markdownCommitMaxWaitTimerRef.current !== null &&
      typeof window !== "undefined"
    ) {
      window.clearTimeout(markdownCommitMaxWaitTimerRef.current)
      markdownCommitMaxWaitTimerRef.current = null
    }
  }, [])

  const discardPendingMarkdownCommit = useCallback(() => {
    cancelPendingMarkdownCommit()
    clearPendingMarkdownCommitMaxWait()
    pendingCommitEditorRef.current = null
    pendingCommitFocusedRef.current = false
  }, [cancelPendingMarkdownCommit, clearPendingMarkdownCommitMaxWait])

  const markCommittedMarkdown = useCallback((markdown: string) => {
    lastCommittedMarkdownRef.current = normalizeEditorMarkdown(markdown)
  }, [])

  const markCommittedDoc = useCallback(
    (nextDoc: BlockEditorDoc) => {
      markCommittedMarkdown(serializeEditorDocToMarkdown(nextDoc))
    },
    [markCommittedMarkdown]
  )

  const hasExternalMarkdownChanged = useCallback((incomingValue: string) => {
    return (
      normalizeEditorMarkdown(incomingValue) !==
      lastCommittedMarkdownRef.current
    )
  }, [])

  const flushPendingMarkdownCommit = useCallback((fallbackEditor?: TiptapEditor | null) => {
    cancelPendingMarkdownCommit()
    clearPendingMarkdownCommitMaxWait()
    const hasPendingEditor = pendingCommitEditorRef.current !== null
    const pendingEditor = pendingCommitEditorRef.current ?? fallbackEditor ?? null
    if (!pendingEditor) return lastCommittedMarkdownRef.current
    if (!hasPendingEditor) {
      pendingCommitFocusedRef.current = pendingEditor.isFocused
    }
    flushPendingNodeViewAttributeCommits()

    const markdown = serializeEditorDocToMarkdown(
      pendingEditor.getJSON() as BlockEditorDoc
    )
    const normalized = normalizeEditorMarkdown(markdown)
    pendingCommitEditorRef.current = null

    if (normalized === lastCommittedMarkdownRef.current) {
      return markdown
    }

    lastCommittedMarkdownRef.current = normalized
    onChange(markdown, { editorFocused: pendingCommitFocusedRef.current })
    return markdown
  }, [cancelPendingMarkdownCommit, clearPendingMarkdownCommitMaxWait, onChange])

  const scheduleMarkdownCommit = useCallback(
    (nextEditor: TiptapEditor) => {
      pendingCommitEditorRef.current = nextEditor
      pendingCommitFocusedRef.current = nextEditor.isFocused

      if (typeof window === "undefined") {
        flushPendingMarkdownCommit()
        return
      }

      cancelPendingMarkdownCommit()
      markdownCommitTimerRef.current = window.setTimeout(() => {
        markdownCommitTimerRef.current = null

        const idleWindow = window as Window & {
          requestIdleCallback?: (
            callback: IdleRequestCallback,
            options?: IdleRequestOptions
          ) => number
        }

        if (typeof idleWindow.requestIdleCallback === "function") {
          markdownCommitIdleModeRef.current = "idle"
          markdownCommitIdleHandleRef.current = idleWindow.requestIdleCallback(
            () => {
              markdownCommitIdleHandleRef.current = null
              markdownCommitIdleModeRef.current = null
              flushPendingMarkdownCommit()
            },
            { timeout: MARKDOWN_COMMIT_IDLE_TIMEOUT_MS }
          )
          return
        }

        markdownCommitIdleModeRef.current = "timeout"
        markdownCommitIdleHandleRef.current = window.setTimeout(() => {
          markdownCommitIdleHandleRef.current = null
          markdownCommitIdleModeRef.current = null
          flushPendingMarkdownCommit()
        }, 16)
      }, MARKDOWN_COMMIT_DEBOUNCE_MS)

      if (markdownCommitMaxWaitTimerRef.current !== null) return
      markdownCommitMaxWaitTimerRef.current = window.setTimeout(() => {
        markdownCommitMaxWaitTimerRef.current = null
        flushPendingMarkdownCommit()
      }, MARKDOWN_COMMIT_MAX_WAIT_MS)
    },
    [cancelPendingMarkdownCommit, flushPendingMarkdownCommit]
  )

  const syncSerializedDoc = useCallback(
    (nextDoc: BlockEditorDoc) => {
      const serialized = serializeEditorDocToMarkdown(nextDoc)
      markCommittedMarkdown(serialized)
      onChange(serialized, { editorFocused: false })
    },
    [markCommittedMarkdown, onChange]
  )

  const flushEditorOnDestroy = useCallback(
    (destroyedEditor: TiptapEditor | null) => {
      if (destroyedEditor) {
        pendingCommitEditorRef.current = destroyedEditor
        pendingCommitFocusedRef.current = destroyedEditor.isFocused
      }
      flushPendingMarkdownCommit()
      pendingCommitEditorRef.current = null
      pendingCommitFocusedRef.current = false
    },
    [flushPendingMarkdownCommit]
  )

  return {
    cancelPendingMarkdownCommit,
    discardPendingMarkdownCommit,
    flushEditorOnDestroy,
    flushPendingMarkdownCommit,
    hasExternalMarkdownChanged,
    markCommittedDoc,
    scheduleMarkdownCommit,
    syncSerializedDoc,
  }
}
