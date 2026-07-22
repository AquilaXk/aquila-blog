import { useRouter } from "next/router"
import { createElement, useCallback, useEffect, useId, useRef, useState } from "react"
import { ConfirmDialog } from "src/design-system/ConfirmDialog"
import {
  captureEditorRouteNavigationIntent,
  defaultEditorRouteNavigationIntent,
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  isForcedEditorExitUrl,
  isSamePathEditorSurfaceNavigation,
  resolveEditorRouteNavigationRetry,
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
      allowNavigationRef.current = true
      try {
        pending.action?.()
      } finally {
        void Promise.resolve().then(() => {
          allowNavigationRef.current = false
        })
      }
      return
    }

    if (pending.kind === "history") {
      // beforePopState already cancelled the pop and restored asPath via pushState.
      // Retry the browser history move (not router.push) so history is not duplicated.
      allowNavigationRef.current = true
      window.history.back()
      void Promise.resolve().then(() => {
        allowNavigationRef.current = false
      })
      return
    }

    if (!pending.url) return
    const retry = resolveEditorRouteNavigationRetry(pending.url, pending.routeIntent)
    allowNavigationRef.current = true
    const navigate = retry.method === "replace" ? router.replace.bind(router) : router.push.bind(router)
    void navigate(retry.url, undefined, retry.options).finally(() => {
      allowNavigationRef.current = false
    })
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

  useEffect(() => {
    if (typeof window === "undefined" || !enabled || !isDirty) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
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
      if (allowNavigationRef.current) return true
      if (isForcedEditorExitUrl(as)) return true
      if (isSamePathEditorSurfaceNavigation(router.asPath, as)) return true

      pendingRef.current = { kind: "history" }
      setConfirmOpen(true)
      window.history.pushState(null, "", router.asPath)
      return false
    })

    const handleRouteChangeStart = (nextUrl: string) => {
      const capturedIntent = pendingRouteIntentRef.current
      pendingRouteIntentRef.current = null

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

    window.addEventListener("beforeunload", handleBeforeUnload)
    router.events.on("routeChangeStart", handleRouteChangeStart)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      router.events.off("routeChangeStart", handleRouteChangeStart)
      router.beforePopState(() => true)
      router.push = originalPush
      router.replace = originalReplace
      pendingRouteIntentRef.current = null
    }
  }, [enabled, isDirty, router])

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
