import { useRouter } from "next/router"
import { createElement, useCallback, useEffect, useId, useRef, useState } from "react"
import { ConfirmDialog } from "src/design-system/ConfirmDialog"
import {
  captureEditorRouteNavigationIntent,
  defaultEditorRouteNavigationIntent,
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  isForcedEditorExitUrl,
  isSamePathEditorSurfaceNavigation,
  readEditorSessionHistoryIndex,
  readEditorUnsavedGuardHistoryIdx,
  resolveEditorHistoryNavigationDelta,
  resolveEditorHistoryNavigationDirection,
  resolveEditorRouteNavigationRetry,
  withEditorUnsavedGuardHistoryIdx,
  type EditorHistoryNavigationDirection,
  type EditorRouteNavigationIntent,
} from "./editorStudioUnsavedExitGuard"

type UseEditorStudioUnsavedExitGuardParams = {
  enabled: boolean
  isDirty: boolean
}

type PendingNavigation = {
  kind: "route" | "action" | "history"
  url?: string
  action?: () => void
  routeIntent?: EditorRouteNavigationIntent
  historyDirection?: EditorHistoryNavigationDirection
}

export const useEditorStudioUnsavedExitGuard = ({
  enabled,
  isDirty,
}: UseEditorStudioUnsavedExitGuardParams) => {
  const titleId = useId()
  const descriptionId = useId()
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const pendingRef = useRef<PendingNavigation | null>(null)
  const allowNavigationRef = useRef(false)
  const pendingRouteIntentRef = useRef<EditorRouteNavigationIntent | null>(null)
  const historyIdxRef = useRef(0)
  const sessionHistoryIndexRef = useRef<number | null>(null)
  const isDirtyRef = useRef(isDirty)
  const undoingHistoryGuardRef = useRef(false)
  const skipHistoryIdxUpdateRef = useRef(false)
  const pendingHistoryDirectionRef = useRef<EditorHistoryNavigationDirection | null>(null)
  const lastRouteMethodRef = useRef<"push" | "replace">("push")

  isDirtyRef.current = isDirty

  const clearAllowNavigation = useCallback(() => {
    allowNavigationRef.current = false
  }, [])

  const stampCurrentHistoryIdx = useCallback(() => {
    if (typeof window === "undefined") return
    window.history.replaceState(
      withEditorUnsavedGuardHistoryIdx(window.history.state, historyIdxRef.current),
      ""
    )
    const sessionIndex = readEditorSessionHistoryIndex()
    if (sessionIndex != null) {
      sessionHistoryIndexRef.current = sessionIndex
    }
  }, [])

  const closeConfirm = useCallback(() => {
    pendingRef.current = null
    setConfirmOpen(false)
  }, [])

  const confirmLeave = useCallback(() => {
    const pending = pendingRef.current
    pendingRef.current = null
    setConfirmOpen(false)
    if (!pending) return

    if (pending.kind === "action") {
      // handleExitDedicatedEditor uses router.replace and will hit routeChangeStart.
      // Keep allow until routeChangeComplete / routeChangeError clears it.
      allowNavigationRef.current = true
      pending.action?.()
      return
    }

    if (pending.kind === "history") {
      // Keep allow until beforePopState consumes it (popstate is after microtasks).
      const direction = pending.historyDirection ?? "back"
      allowNavigationRef.current = true
      pendingHistoryDirectionRef.current = direction
      window.history.go(resolveEditorHistoryNavigationDelta(direction))
      return
    }

    if (!pending.url) return
    const retry = resolveEditorRouteNavigationRetry(pending.url, pending.routeIntent)
    allowNavigationRef.current = true
    lastRouteMethodRef.current = retry.method
    const navigate = retry.method === "replace" ? router.replace.bind(router) : router.push.bind(router)
    void navigate(retry.url, undefined, retry.options)
  }, [router])

  const requestGuardedAction = useCallback(
    (action: () => void) => {
      if (!enabled || !isDirty) {
        action()
        return
      }
      pendingRef.current = { kind: "action", action }
      setConfirmOpen(true)
    },
    [enabled, isDirty]
  )

  // Keep history idx stamps for the whole editor session (not only while dirty) so a
  // clean Editor → Page leave still stamps the forward entry for later dirty pops.
  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return

    const existingIdx = readEditorUnsavedGuardHistoryIdx(window.history.state)
    if (existingIdx == null) {
      historyIdxRef.current = 0
      stampCurrentHistoryIdx()
    } else {
      historyIdxRef.current = existingIdx
      const sessionIndex = readEditorSessionHistoryIndex()
      if (sessionIndex != null) {
        sessionHistoryIndexRef.current = sessionIndex
      }
    }

    const originalPushState = window.history.pushState.bind(window.history)
    const originalReplaceState = window.history.replaceState.bind(window.history)

    window.history.pushState = ((state, unused, url) => {
      if (!undoingHistoryGuardRef.current && !skipHistoryIdxUpdateRef.current) {
        historyIdxRef.current += 1
        state = withEditorUnsavedGuardHistoryIdx(state, historyIdxRef.current)
      }
      return originalPushState(state, unused, url)
    }) as typeof window.history.pushState

    window.history.replaceState = ((state, unused, url) => {
      if (!undoingHistoryGuardRef.current) {
        const existing = readEditorUnsavedGuardHistoryIdx(state)
        state = withEditorUnsavedGuardHistoryIdx(
          state,
          existing ?? historyIdxRef.current
        )
      }
      return originalReplaceState(state, unused, url)
    }) as typeof window.history.replaceState

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return
      event.preventDefault()
      event.returnValue = EDITOR_UNSAVED_CHANGES_MESSAGE
      return EDITOR_UNSAVED_CHANGES_MESSAGE
    }

    const originalPush = router.push.bind(router)
    const originalReplace = router.replace.bind(router)

    router.push = ((url, as, options) => {
      lastRouteMethodRef.current = "push"
      pendingRouteIntentRef.current = captureEditorRouteNavigationIntent("push", options)
      return originalPush(url, as, options)
    }) as typeof router.push

    router.replace = ((url, as, options) => {
      lastRouteMethodRef.current = "replace"
      pendingRouteIntentRef.current = captureEditorRouteNavigationIntent("replace", options)
      return originalReplace(url, as, options)
    }) as typeof router.replace

    const syncHistoryIdxFromDestination = (destinationIdx: number | null, direction: EditorHistoryNavigationDirection) => {
      if (destinationIdx != null) {
        historyIdxRef.current = destinationIdx
      } else {
        historyIdxRef.current += resolveEditorHistoryNavigationDelta(direction)
      }
      skipHistoryIdxUpdateRef.current = true
      stampCurrentHistoryIdx()
    }

    router.beforePopState(({ as }) => {
      // Undo move after a blocked pop — let Next sync back to the editor URL.
      if (undoingHistoryGuardRef.current) {
        undoingHistoryGuardRef.current = false
        skipHistoryIdxUpdateRef.current = true
        return true
      }

      // Allowed retry after confirm — clear here so a microtask cannot race popstate.
      if (allowNavigationRef.current) {
        clearAllowNavigation()
        return true
      }

      if (isForcedEditorExitUrl(as)) return true

      const destinationIdx = readEditorUnsavedGuardHistoryIdx(window.history.state)
      const destinationSessionIndex = readEditorSessionHistoryIndex()
      const direction = resolveEditorHistoryNavigationDirection(
        historyIdxRef.current,
        destinationIdx,
        {
          currentSessionIndex: sessionHistoryIndexRef.current,
          destinationSessionIndex,
        }
      )

      if (isSamePathEditorSurfaceNavigation(router.asPath, as)) {
        // Same-pathname query/surface pops still move history; sync idx so a later
        // forward/back is not misclassified from a stale push increment.
        syncHistoryIdxFromDestination(destinationIdx, direction)
        return true
      }

      if (!isDirtyRef.current) {
        syncHistoryIdxFromDestination(destinationIdx, direction)
        return true
      }

      pendingRef.current = { kind: "history", historyDirection: direction }
      setConfirmOpen(true)

      // Browser already applied the pop; undo with the opposite delta (not pushState)
      // so confirm can replay the original back/forward direction.
      undoingHistoryGuardRef.current = true
      const undoDelta = -resolveEditorHistoryNavigationDelta(direction)
      queueMicrotask(() => {
        window.history.go(undoDelta)
      })
      return false
    })

    const handleRouteChangeStart = (nextUrl: string) => {
      const capturedIntent = pendingRouteIntentRef.current
      pendingRouteIntentRef.current = null

      if (!isDirtyRef.current) return
      if (allowNavigationRef.current) return
      if (nextUrl === router.asPath) return
      if (isSamePathEditorSurfaceNavigation(router.asPath, nextUrl)) return
      if (isForcedEditorExitUrl(nextUrl)) return

      pendingRef.current = {
        kind: "route",
        url: nextUrl,
        routeIntent: capturedIntent ?? defaultEditorRouteNavigationIntent(),
      }
      setConfirmOpen(true)
      router.events.emit("routeChangeError")
      const error = new Error("Navigation aborted due to unsaved editor changes.") as Error & {
        cancelled?: boolean
      }
      error.cancelled = true
      throw error
    }

    const handleRouteChangeComplete = () => {
      clearAllowNavigation()

      if (skipHistoryIdxUpdateRef.current) {
        skipHistoryIdxUpdateRef.current = false
        stampCurrentHistoryIdx()
        return
      }

      const historyDirection = pendingHistoryDirectionRef.current
      if (historyDirection) {
        pendingHistoryDirectionRef.current = null
        historyIdxRef.current += resolveEditorHistoryNavigationDelta(historyDirection)
        stampCurrentHistoryIdx()
        return
      }

      if (lastRouteMethodRef.current === "replace") {
        stampCurrentHistoryIdx()
        return
      }

      // pushState wrapper already advanced historyIdxRef; only stamp/session sync here.
      stampCurrentHistoryIdx()
    }

    const handleRouteChangeError = () => {
      clearAllowNavigation()
      pendingHistoryDirectionRef.current = null
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    router.events.on("routeChangeStart", handleRouteChangeStart)
    router.events.on("routeChangeComplete", handleRouteChangeComplete)
    router.events.on("routeChangeError", handleRouteChangeError)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      router.events.off("routeChangeStart", handleRouteChangeStart)
      router.events.off("routeChangeComplete", handleRouteChangeComplete)
      router.events.off("routeChangeError", handleRouteChangeError)
      router.beforePopState(() => true)
      router.push = originalPush
      router.replace = originalReplace
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
      pendingRouteIntentRef.current = null
      pendingHistoryDirectionRef.current = null
      undoingHistoryGuardRef.current = false
      skipHistoryIdxUpdateRef.current = false
      clearAllowNavigation()
    }
  }, [clearAllowNavigation, enabled, router, stampCurrentHistoryIdx])

  // Keep this module .ts (no JSX) so next lint/eslint can parse it.
  const dialog = createElement(ConfirmDialog, {
    open: confirmOpen,
    titleId,
    descriptionId,
    title: "저장되지 않은 변경이 있습니다",
    description: EDITOR_UNSAVED_CHANGES_MESSAGE,
    confirmLabel: "나가기",
    cancelLabel: "계속 작성",
    confirmTone: "danger",
    onConfirm: confirmLeave,
    onCancel: closeConfirm,
  })

  return {
    requestGuardedAction,
    dialog,
  }
}
