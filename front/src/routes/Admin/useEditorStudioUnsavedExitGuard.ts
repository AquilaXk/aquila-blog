import type { NextRouter } from "next/router"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { ConfirmDialog } from "src/design-system/ConfirmDialog"
import {
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  isForcedEditorExitUrl,
} from "./editorStudioUnsavedExitGuard"

type UseEditorStudioUnsavedExitGuardParams = {
  enabled: boolean
  isDirty: boolean
  router: NextRouter
}

type PendingNavigation = {
  kind: "route" | "action"
  url?: string
  action?: () => void
}

export const useEditorStudioUnsavedExitGuard = ({
  enabled,
  isDirty,
  router,
}: UseEditorStudioUnsavedExitGuardParams) => {
  const titleId = useId()
  const descriptionId = useId()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const pendingRef = useRef<PendingNavigation | null>(null)
  const allowNavigationRef = useRef(false)

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
      pending.action?.()
      return
    }

    if (!pending.url) return
    allowNavigationRef.current = true
    void router.push(pending.url).finally(() => {
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

    const handleRouteChangeStart = (nextUrl: string) => {
      if (allowNavigationRef.current) return
      if (nextUrl === router.asPath) return
      if (isForcedEditorExitUrl(nextUrl)) return

      pendingRef.current = { kind: "route", url: nextUrl }
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
    }
  }, [enabled, isDirty, router])

  const dialog = (
    <ConfirmDialog
      open={confirmOpen}
      titleId={titleId}
      descriptionId={descriptionId}
      title="저장되지 않은 변경이 있습니다"
      description={EDITOR_UNSAVED_CHANGES_MESSAGE}
      confirmLabel="나가기"
      cancelLabel="계속 작성"
      confirmTone="danger"
      onConfirm={confirmLeave}
      onCancel={closeConfirm}
    />
  )

  return {
    requestGuardedAction,
    dialog,
  }
}
