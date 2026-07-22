import { useRouter } from "next/router"
import { createElement, useCallback, useEffect, useId, useRef, useState } from "react"
import { ConfirmDialog } from "src/design-system/ConfirmDialog"
import {
  captureEditorRouteNavigationIntent,
  consumeForcedEditorExitUrl,
  defaultEditorRouteNavigationIntent,
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  isForcedEditorExitUrl,
  isSamePathEditorSurfaceNavigation,
  resolveEditorRouteNavigationRetry,
  restoreEditorUrlAfterBlockedHistoryPop,
  type EditorRouteNavigationIntent,
} from "./editorStudioUnsavedExitGuard"

type UseEditorStudioUnsavedExitGuardParams = {
  enabled: boolean
  /** Render-time dirty (closes dialog when a save clears dirty). */
  isDirty: boolean
  /**
   * Navigation-time dirty check. Prefer live markdown (flush / postContentLiveRef)
   * so focused typing is not lost behind a lagged postContent transition.
   */
  getIsDirty?: () => boolean
}

type PendingNavigation = {
  kind: "route" | "action" | "history"
  url?: string
  action?: () => void
  routeIntent?: EditorRouteNavigationIntent
}

export const useEditorStudioUnsavedExitGuard = ({
  enabled,
  isDirty,
  getIsDirty,
}: UseEditorStudioUnsavedExitGuardParams) => {
  const titleId = useId()
  const descriptionId = useId()
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const pendingRef = useRef<PendingNavigation | null>(null)
  const allowNavigationRef = useRef(false)
  const pendingRouteIntentRef = useRef<EditorRouteNavigationIntent | null>(null)
  /** Last Next.js history.state while settled on the editor (before a blocked pop). */
  const editorHistoryStateRef = useRef<unknown>(null)
  const getIsDirtyRef = useRef(getIsDirty)
  const isDirtyRef = useRef(isDirty)
  getIsDirtyRef.current = getIsDirty
  isDirtyRef.current = isDirty

  const readIsDirty = useCallback(() => {
    const live = getIsDirtyRef.current
    return typeof live === "function" ? live() : isDirtyRef.current
  }, [])

  const clearAllowNavigation = useCallback(() => {
    allowNavigationRef.current = false
  }, [])

  const closeConfirm = useCallback(() => {
    pendingRef.current = null
    setConfirmOpen(false)
  }, [])

  // Clean save / guard disable must not leave a stale confirm + pending navigation.
  // Require live dirty clear too so a dialog opened from getIsDirty is not closed
  // while postContent is still catching up behind startTransition.
  useEffect(() => {
    if (!enabled) {
      closeConfirm()
      return
    }
    if (!isDirty && !readIsDirty()) {
      closeConfirm()
    }
  }, [closeConfirm, enabled, isDirty, readIsDirty])

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
      // Block path restored the editor URL with pushState on top of the destination,
      // so confirm is always history.back() — no forward/back classification.
      allowNavigationRef.current = true
      window.history.back()
      return
    }

    if (!pending.url) return
    const retry = resolveEditorRouteNavigationRetry(pending.url, pending.routeIntent)
    allowNavigationRef.current = true
    const navigate = retry.method === "replace" ? router.replace.bind(router) : router.push.bind(router)
    void navigate(retry.url, undefined, retry.options)
  }, [router])

  const requestGuardedAction = useCallback(
    (action: () => void) => {
      if (!enabled || !readIsDirty()) {
        action()
        return
      }
      pendingRef.current = { kind: "action", action }
      setConfirmOpen(true)
    },
    [enabled, readIsDirty]
  )

  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return

    const captureEditorHistoryState = () => {
      editorHistoryStateRef.current = window.history.state
    }
    captureEditorHistoryState()

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!readIsDirty()) return
      event.preventDefault()
      event.returnValue = EDITOR_UNSAVED_CHANGES_MESSAGE
      return EDITOR_UNSAVED_CHANGES_MESSAGE
    }

    const originalPush = router.push.bind(router)
    const originalReplace = router.replace.bind(router)

    router.push = ((url, as, options) => {
      pendingRouteIntentRef.current = captureEditorRouteNavigationIntent("push", options)
      return originalPush(url, as, options)
    }) as typeof router.push

    router.replace = ((url, as, options) => {
      pendingRouteIntentRef.current = captureEditorRouteNavigationIntent("replace", options)
      return originalReplace(url, as, options)
    }) as typeof router.replace

    router.beforePopState(({ as }) => {
      // Allowed retry after confirm — clear here so a microtask cannot race popstate.
      if (allowNavigationRef.current) {
        clearAllowNavigation()
        return true
      }

      if (isForcedEditorExitUrl(as)) {
        consumeForcedEditorExitUrl(as)
        return true
      }
      if (isSamePathEditorSurfaceNavigation(router.asPath, as)) return true
      if (!readIsDirty()) return true

      pendingRef.current = { kind: "history" }
      setConfirmOpen(true)
      // Browser already applied the pop; restore editor URL with the pre-pop Next
      // history state so later Back can re-render the editor (not URL-only).
      restoreEditorUrlAfterBlockedHistoryPop(
        router.asPath,
        window.history,
        editorHistoryStateRef.current
      )
      captureEditorHistoryState()
      return false
    })

    const handleRouteChangeStart = (nextUrl: string) => {
      const capturedIntent = pendingRouteIntentRef.current
      pendingRouteIntentRef.current = null

      if (!readIsDirty()) return
      if (allowNavigationRef.current) return
      if (nextUrl === router.asPath) return
      if (isSamePathEditorSurfaceNavigation(router.asPath, nextUrl)) return
      if (isForcedEditorExitUrl(nextUrl)) {
        consumeForcedEditorExitUrl(nextUrl)
        return
      }

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
      captureEditorHistoryState()
    }

    const handleRouteChangeError = () => {
      clearAllowNavigation()
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
      pendingRouteIntentRef.current = null
      clearAllowNavigation()
    }
  }, [clearAllowNavigation, enabled, readIsDirty, router])

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
