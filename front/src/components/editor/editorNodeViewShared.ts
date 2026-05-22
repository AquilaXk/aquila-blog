
import styled from "@emotion/styled"
import type { NodeViewProps } from "@tiptap/react"
import {
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react"

export const TEXTAREA_DEBOUNCE_MS = 180

export const isPrimarySelectAllShortcut = (event: ReactKeyboardEvent<HTMLElement>) => {
  if (event.altKey || event.shiftKey) return false
  if (!(event.metaKey || event.ctrlKey)) return false
  return event.key.toLowerCase() === "a"
}

export const selectDomTextContents = (root: HTMLElement | null) => {
  if (!root) return false
  const selection = window.getSelection()
  if (!selection) return false

  const range = document.createRange()
  range.selectNodeContents(root)
  selection.removeAllRanges()
  selection.addRange(range)
  root.focus()
  return true
}

export const useAutosizeTextarea = (
  ref: { current: HTMLTextAreaElement | null },
  value: string,
  layoutVersion?: string | number | boolean
) => {
  const rafIdRef = useRef<number | null>(null)
  const metricsRef = useRef<{
    rows: number
    minHeightFromRows: number
  }>({
    rows: Number.NaN,
    minHeightFromRows: 0,
  })
  const previousLayoutVersionRef = useRef<string | number | boolean | undefined>(undefined)

  const cancelQueuedSync = useCallback(() => {
    if (typeof window === "undefined") return
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [])

  const syncHeight = useCallback((remeasureBase = false) => {
    const element = ref.current
    if (!element) return
    const rows = Number(element.getAttribute("rows") || 0)
    if (remeasureBase || metricsRef.current.rows !== rows) {
      const computedStyle = window.getComputedStyle(element)
      const lineHeight = Number.parseFloat(computedStyle.lineHeight || "0")
      const paddingBlock =
        Number.parseFloat(computedStyle.paddingTop || "0") + Number.parseFloat(computedStyle.paddingBottom || "0")
      metricsRef.current = {
        rows,
        minHeightFromRows: rows > 0 && Number.isFinite(lineHeight) ? rows * lineHeight + paddingBlock : 0,
      }
    }
    element.style.height = "auto"
    element.style.height = `${Math.ceil(Math.max(element.scrollHeight + 6, metricsRef.current.minHeightFromRows + 6, 88))}px`
  }, [ref])

  const queueSyncHeight = useCallback((remeasureBase = false) => {
    cancelQueuedSync()
    if (typeof window === "undefined") return
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null
      syncHeight(remeasureBase)
    })
  }, [cancelQueuedSync, syncHeight])

  useLayoutEffect(() => {
    const remeasureBase = previousLayoutVersionRef.current !== layoutVersion
    previousLayoutVersionRef.current = layoutVersion
    syncHeight(remeasureBase)
    return cancelQueuedSync
  }, [cancelQueuedSync, layoutVersion, syncHeight, value])

  useEffect(() => {
    const element = ref.current
    if (!element || typeof window === "undefined") return

    const handleResize = () => queueSyncHeight(true)
    const handleFocus = () => queueSyncHeight(true)
    window.addEventListener("resize", handleResize)
    element.addEventListener("focus", handleFocus)
    element.addEventListener("click", handleFocus)

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        queueSyncHeight(true)
      })
      if (element.parentElement) observer.observe(element.parentElement)
      observer.observe(element)
    }

    const fontSet = document.fonts
    let disposed = false
    if (fontSet?.ready) {
      void fontSet.ready.then(() => {
        if (!disposed) queueSyncHeight()
      })
    }

    return () => {
      disposed = true
      window.removeEventListener("resize", handleResize)
      element.removeEventListener("focus", handleFocus)
      element.removeEventListener("click", handleFocus)
      observer?.disconnect()
      cancelQueuedSync()
    }
  }, [cancelQueuedSync, queueSyncHeight, ref, value, layoutVersion])
}

export const useDebouncedAttributeCommit = (
  updateAttributes: NodeViewProps["updateAttributes"],
  delay = TEXTAREA_DEBOUNCE_MS
) => {
  const debounceRef = useRef<number | null>(null)
  const latestAttrsRef = useRef<Record<string, unknown> | null>(null)

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const cancel = () => {
    if (typeof window !== "undefined" && debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }

  const flush = () => {
    if (!latestAttrsRef.current) return
    cancel()
    updateAttributes(latestAttrsRef.current)
    latestAttrsRef.current = null
  }

  const schedule = (attrs: Record<string, unknown>) => {
    latestAttrsRef.current = attrs
    if (typeof window === "undefined") {
      updateAttributes(attrs)
      return
    }

    cancel()

    debounceRef.current = window.setTimeout(() => {
      if (latestAttrsRef.current) {
        updateAttributes(latestAttrsRef.current)
        latestAttrsRef.current = null
      }
      debounceRef.current = null
    }, delay)
  }

  return {
    schedule,
    flush,
    cancel,
  }
}

export const BlockTextarea = styled.textarea<{ rows?: number }>`
  min-height: ${({ rows }) => (rows ? `${Math.max(Number(rows) * 1.8, 6)}rem` : "6rem")};
  width: 100%;
  resize: none;
  overflow: hidden;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: 0.95rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(10, 12, 16, 0.92)")};
  color: ${({ theme }) => theme.colors.gray12};
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.88rem;
  line-height: 1.6;
  padding: 1rem;
`

export const CompactBlockTextarea = styled(BlockTextarea)`
  min-height: 4.5rem;
  padding: 0.9rem 1rem;
  font-size: 0.9rem;
  line-height: 1.55;
`
