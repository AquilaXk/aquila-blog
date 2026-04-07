import type { NextRouter } from "next/router"
import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react"
import {
  isNavigationCancelledError,
  pushRoute,
  replaceRoute,
  replaceShallowRoutePreservingScroll,
  toLoginPath,
} from "src/libs/router"

type StudioSetState<T> = Dispatch<SetStateAction<T>>

type SessionMember = {
  isAdmin?: boolean
}

type UseEditorStudioRoutingParams = {
  router: NextRouter
  authStatus: string
  sessionMember: SessionMember | null
  postId: string
  isDedicatedEditorRoute: boolean
  isDedicatedNewEditorRoute: boolean
  adminPostsWorkspaceRoute: string
  editorNewRoutePath: string
  toEditorPostRoute: (id: string | number) => string
  normalizeEditorReturnRoute: (value: string) => string
  pretty: (value: unknown) => string
  setResult: StudioSetState<string>
  setPostId: StudioSetState<string>
  setIsNewEditorBootstrapPending: StudioSetState<boolean>
  redirectingRef: MutableRefObject<boolean>
  autoLoadedPostIdRef: MutableRefObject<string | null>
  autoCreatedTempDraftRef: MutableRefObject<boolean>
  restoreLocalDraft: () => void
  loadPostForEditor: (targetPostId?: string) => Promise<void>
  handleLoadOrCreateTempPost: (options?: {
    redirectToEditor?: boolean
    source?: string
    returnTo?: string
  }) => Promise<void>
}

export const useEditorStudioRouting = ({
  adminPostsWorkspaceRoute,
  authStatus,
  autoCreatedTempDraftRef,
  autoLoadedPostIdRef,
  editorNewRoutePath,
  handleLoadOrCreateTempPost,
  isDedicatedEditorRoute,
  isDedicatedNewEditorRoute,
  loadPostForEditor,
  normalizeEditorReturnRoute,
  postId,
  pretty,
  redirectingRef,
  restoreLocalDraft,
  router,
  sessionMember,
  setIsNewEditorBootstrapPending,
  setPostId,
  setResult,
  toEditorPostRoute,
}: UseEditorStudioRoutingParams) => {
  const activeEditorRoute = useMemo(() => {
    if (postId.trim()) return toEditorPostRoute(postId.trim())
    return editorNewRoutePath
  }, [editorNewRoutePath, postId, toEditorPostRoute])

  const dedicatedEditorReturnRoute = useMemo(() => {
    if (!isDedicatedEditorRoute) return adminPostsWorkspaceRoute
    const rawReturnTo = typeof router.query.returnTo === "string" ? router.query.returnTo : ""
    return normalizeEditorReturnRoute(rawReturnTo) || adminPostsWorkspaceRoute
  }, [adminPostsWorkspaceRoute, isDedicatedEditorRoute, normalizeEditorReturnRoute, router.query.returnTo])

  useEffect(() => {
    if (authStatus === "loading" || authStatus === "unavailable") return

    if (!sessionMember) {
      const target = toLoginPath(router.asPath || activeEditorRoute, activeEditorRoute)
      if (!redirectingRef.current && router.asPath !== target) {
        redirectingRef.current = true
        void (async () => {
          try {
            await replaceRoute(router, target, { preferHardNavigation: true })
          } catch (error) {
            if (!isNavigationCancelledError(error)) {
              setResult(pretty({ error: error instanceof Error ? error.message : String(error) }))
            }
          }
        })()
      }
      return
    }

    if (!sessionMember.isAdmin) {
      if (!redirectingRef.current && router.asPath !== "/") {
        redirectingRef.current = true
        void (async () => {
          try {
            await replaceRoute(router, "/", { preferHardNavigation: true })
          } catch (error) {
            if (!isNavigationCancelledError(error)) {
              setResult(pretty({ error: error instanceof Error ? error.message : String(error) }))
            }
          }
        })()
      }
    }
  }, [activeEditorRoute, authStatus, pretty, redirectingRef, router, sessionMember, setResult])

  useEffect(() => {
    if (!router.isReady) return

    const queryPostId =
      typeof router.query.id === "string"
        ? router.query.id.trim()
        : typeof router.query.postId === "string"
          ? router.query.postId.trim()
          : ""
    if (!queryPostId) return
    if (autoLoadedPostIdRef.current === queryPostId) return

    autoLoadedPostIdRef.current = queryPostId
    setPostId(queryPostId)
    void loadPostForEditor(queryPostId)
  }, [autoLoadedPostIdRef, loadPostForEditor, router.isReady, router.query.id, router.query.postId, setPostId])

  useEffect(() => {
    if (!router.isReady) return
    const source = typeof router.query.source === "string" ? router.query.source.trim() : ""
    if (source !== "local-draft") return
    restoreLocalDraft()
    const nextQuery = { ...router.query }
    delete nextQuery.source
    void replaceShallowRoutePreservingScroll(router, { query: nextQuery })
  }, [restoreLocalDraft, router])

  useEffect(() => {
    if (!isDedicatedNewEditorRoute) {
      autoCreatedTempDraftRef.current = false
      setIsNewEditorBootstrapPending(false)
      return
    }

    if (!postId.trim()) {
      setIsNewEditorBootstrapPending(true)
    }
  }, [autoCreatedTempDraftRef, isDedicatedNewEditorRoute, postId, setIsNewEditorBootstrapPending])

  useEffect(() => {
    if (!router.isReady || !isDedicatedEditorRoute || !sessionMember?.isAdmin) return
    if (router.pathname !== editorNewRoutePath) return
    if (autoCreatedTempDraftRef.current) return

    autoCreatedTempDraftRef.current = true
    const source = typeof router.query.source === "string" ? router.query.source.trim() : ""
    const returnTo =
      typeof router.query.returnTo === "string"
        ? normalizeEditorReturnRoute(router.query.returnTo)
        : ""
    void handleLoadOrCreateTempPost({
      redirectToEditor: true,
      source: source || undefined,
      returnTo: returnTo || undefined,
    })
  }, [
    autoCreatedTempDraftRef,
    editorNewRoutePath,
    handleLoadOrCreateTempPost,
    isDedicatedEditorRoute,
    normalizeEditorReturnRoute,
    router,
    sessionMember?.isAdmin,
  ])

  const handleExitDedicatedEditor = useCallback(() => {
    void pushRoute(router, dedicatedEditorReturnRoute)
  }, [dedicatedEditorReturnRoute, router])

  return {
    activeEditorRoute,
    dedicatedEditorReturnRoute,
    handleExitDedicatedEditor,
  }
}
