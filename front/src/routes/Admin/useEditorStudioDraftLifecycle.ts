import type { NextRouter } from "next/router"
import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react"
import { apiFetch } from "src/apis/backend/client"
import { replaceRoute } from "src/libs/router"
import {
  isServerTempDraftPost,
  isTempDraftTitlePlaceholder,
} from "./editorTempDraft"

type StudioSetState<T> = Dispatch<SetStateAction<T>>
type NoticeTone = "idle" | "loading" | "success" | "error"
type PublishNotice = { tone: NoticeTone; text: string }
type PublishTarget = "page" | "modal"
type PostVisibility = "PRIVATE" | "PUBLIC_UNLISTED" | "PUBLIC_LISTED"
type EditorMode = "create" | "edit"
type ComposeMobileStudioStep = "edit" | "publish"

type LocalDraftPayload = {
  title: string
  content: string
  summary: string
  thumbnailUrl: string
  thumbnailFocusX: number
  thumbnailFocusY: number
  thumbnailZoom: number
  tags: string[]
  category: string
  visibility: PostVisibility
  savedAt: string
}

type ResolvedEditorMetaSnapshot = {
  body: string
  summary: string
  thumbnailUrl: string
  thumbnailFocusX: number
  thumbnailFocusY: number
  thumbnailZoom: number
  tags: string[]
  category: string
}

type PostForEditor = {
  id: string | number
  version?: number | null
  title?: string
  content?: string
  contentHtml?: string | null
  published: boolean
  listed: boolean
  tempDraft?: boolean
}

type AdminPostListItem = {
  id: number
  title: string
  modifiedAt: string
  deletedAt?: string | null
  published: boolean
  listed: boolean
  tempDraft?: boolean
}

type PageDto<T> = {
  content?: T[]
}

type RsData<T> = {
  data: T
  msg: string
}

type EditorFingerprintPayload = {
  title: string
  content: string
  summary: string
  thumbnailUrl: string
  thumbnailFocusX: number
  thumbnailFocusY: number
  thumbnailZoom: number
  tags: string[]
  category: string
  visibility: PostVisibility
}

type UseEditorStudioDraftLifecycleParams = {
  router: NextRouter
  toEditorPostRoute: (id: string | number) => string
  postId: string
  postTitle: string
  postContent: string
  postSummary: string
  postThumbnailUrl: string
  postThumbnailFocusX: number
  postThumbnailFocusY: number
  postThumbnailZoom: number
  postTags: string[]
  postCategory: string
  postVisibility: PostVisibility
  isCompactMobileLayout: boolean
  setEditorMode: StudioSetState<EditorMode>
  setIsTempDraftMode: StudioSetState<boolean>
  setPostId: StudioSetState<string>
  setPostVersion: StudioSetState<number | null>
  setPreviewThumbnailSourceUrl: StudioSetState<string>
  setPostTitle: StudioSetState<string>
  setPostContent: StudioSetState<string>
  setPostSummary: StudioSetState<string>
  setPostThumbnailUrl: StudioSetState<string>
  setPostThumbnailFocusX: StudioSetState<number>
  setPostThumbnailFocusY: StudioSetState<number>
  setPostThumbnailZoom: StudioSetState<number>
  setPostTags: StudioSetState<string[]>
  setPostCategory: StudioSetState<string>
  setPostVisibility: StudioSetState<PostVisibility>
  setKnownTags: StudioSetState<string[]>
  setLocalDraftSavedAt: StudioSetState<string>
  setLoadingKey: StudioSetState<string>
  setResult: StudioSetState<string>
  setIsNewEditorBootstrapPending: StudioSetState<boolean>
  setMobileComposeStep: StudioSetState<ComposeMobileStudioStep>
  activateComposeSurface: () => void
  setPublishStatus: (notice: PublishNotice, target?: PublishTarget) => void
  dedupeStrings: (items: string[]) => string[]
  normalizeCategoryValue: (value: string) => string
  buildLocalDraftFingerprint: (payload: Omit<LocalDraftPayload, "savedAt">) => string
  persistLocalDraft: (payload: LocalDraftPayload) => void
  readLocalDraft: () => LocalDraftPayload | null
  removeLocalDraft: () => void
  buildEditorStateFingerprint: (payload: EditorFingerprintPayload) => string
  pretty: (value: unknown) => string
  resolveEditorMetaSnapshot: (content: string, contentHtml?: string | null) => ResolvedEditorMetaSnapshot
  syncEditorMeta: (content: string, contentHtml?: string | null) => ResolvedEditorMetaSnapshot
  buildEmptyEditorMetaSnapshot: () => ResolvedEditorMetaSnapshot
  isBlankServerTempDraft: (
    post: Pick<PostForEditor, "title" | "published" | "listed" | "tempDraft">,
    snapshot: ResolvedEditorMetaSnapshot
  ) => boolean
  toVisibility: (published: boolean, listed: boolean) => PostVisibility
  requestTempPostWithConflictRetry: (
    loadExistingTempPostForRecovery: () => Promise<PostForEditor | null>
  ) => Promise<RsData<PostForEditor>>
  defaultThumbnailFocusX: number
  defaultThumbnailFocusY: number
  defaultThumbnailZoom: number
  lastLocalDraftFingerprintRef: MutableRefObject<string>
  lastWriteFingerprintRef: MutableRefObject<string>
  lastWriteIdempotencyKeyRef: MutableRefObject<string>
  serverBaselineEditorFingerprintRef: MutableRefObject<string>
  tempPostRequestRef: MutableRefObject<Promise<RsData<PostForEditor>> | null>
}

export const useEditorStudioDraftLifecycle = ({
  activateComposeSurface,
  buildEditorStateFingerprint,
  buildEmptyEditorMetaSnapshot,
  buildLocalDraftFingerprint,
  dedupeStrings,
  defaultThumbnailFocusX,
  defaultThumbnailFocusY,
  defaultThumbnailZoom,
  isBlankServerTempDraft,
  isCompactMobileLayout,
  lastLocalDraftFingerprintRef,
  lastWriteFingerprintRef,
  lastWriteIdempotencyKeyRef,
  normalizeCategoryValue,
  persistLocalDraft,
  postCategory,
  postContent,
  postId,
  postSummary,
  postTags,
  postThumbnailFocusX,
  postThumbnailFocusY,
  postThumbnailUrl,
  postThumbnailZoom,
  postTitle,
  postVisibility,
  pretty,
  readLocalDraft,
  removeLocalDraft,
  requestTempPostWithConflictRetry,
  resolveEditorMetaSnapshot,
  router,
  serverBaselineEditorFingerprintRef,
  setEditorMode,
  setIsNewEditorBootstrapPending,
  setIsTempDraftMode,
  setKnownTags,
  setLoadingKey,
  setLocalDraftSavedAt,
  setMobileComposeStep,
  setPostCategory,
  setPostContent,
  setPostId,
  setPostSummary,
  setPostTags,
  setPostThumbnailFocusX,
  setPostThumbnailFocusY,
  setPostThumbnailUrl,
  setPostThumbnailZoom,
  setPostTitle,
  setPostVersion,
  setPostVisibility,
  setPreviewThumbnailSourceUrl,
  setPublishStatus,
  setResult,
  syncEditorMeta,
  tempPostRequestRef,
  toEditorPostRoute,
  toVisibility,
}: UseEditorStudioDraftLifecycleParams) => {
  const localDraftCore = useMemo(
    () => ({
      title: postTitle,
      content: postContent,
      summary: postSummary,
      thumbnailUrl: postThumbnailUrl,
      thumbnailFocusX: postThumbnailFocusX,
      thumbnailFocusY: postThumbnailFocusY,
      thumbnailZoom: postThumbnailZoom,
      tags: dedupeStrings(postTags),
      category: postCategory ? normalizeCategoryValue(postCategory) : "",
      visibility: postVisibility,
    }),
    [
      dedupeStrings,
      normalizeCategoryValue,
      postCategory,
      postContent,
      postSummary,
      postTags,
      postThumbnailFocusX,
      postThumbnailFocusY,
      postThumbnailUrl,
      postThumbnailZoom,
      postTitle,
      postVisibility,
    ]
  )

  const localDraftFingerprint = useMemo(
    () => buildLocalDraftFingerprint(localDraftCore),
    [buildLocalDraftFingerprint, localDraftCore]
  )

  const saveLocalDraft = useCallback((options?: { silent?: boolean }) => {
    if (lastLocalDraftFingerprintRef.current === localDraftFingerprint) {
      return
    }

    const payload: LocalDraftPayload = {
      ...localDraftCore,
      savedAt: new Date().toISOString(),
    }

    persistLocalDraft(payload)
    lastLocalDraftFingerprintRef.current = localDraftFingerprint
    setLocalDraftSavedAt(payload.savedAt)

    if (!options?.silent) {
      setPublishStatus(
        {
          tone: "success",
          text: `브라우저 임시저장 완료 (${payload.savedAt.slice(11, 16)})`,
        },
        "page"
      )
    }
  }, [
    lastLocalDraftFingerprintRef,
    localDraftCore,
    localDraftFingerprint,
    persistLocalDraft,
    setLocalDraftSavedAt,
    setPublishStatus,
  ])

  const restoreLocalDraft = useCallback(() => {
    const draft = readLocalDraft()
    if (!draft) {
      setPublishStatus(
        {
          tone: "error",
          text: "저장된 브라우저 임시글이 없습니다.",
        },
        "page"
      )
      return
    }

    setEditorMode("create")
    setIsTempDraftMode(false)
    setPostId("")
    setPostVersion(null)
    lastWriteFingerprintRef.current = ""
    lastWriteIdempotencyKeyRef.current = ""
    lastLocalDraftFingerprintRef.current = buildLocalDraftFingerprint({
      title: draft.title,
      content: draft.content,
      summary: draft.summary,
      thumbnailUrl: draft.thumbnailUrl,
      thumbnailFocusX: draft.thumbnailFocusX,
      thumbnailFocusY: draft.thumbnailFocusY,
      thumbnailZoom: draft.thumbnailZoom,
      tags: dedupeStrings(draft.tags),
      category: draft.category ? normalizeCategoryValue(draft.category) : "",
      visibility: draft.visibility,
    })

    setPostTitle(draft.title)
    setPostContent(draft.content)
    setPostSummary(draft.summary)
    setPostThumbnailUrl(draft.thumbnailUrl)
    setPostThumbnailFocusX(draft.thumbnailFocusX)
    setPostThumbnailFocusY(draft.thumbnailFocusY)
    setPostThumbnailZoom(draft.thumbnailZoom)
    setPreviewThumbnailSourceUrl("")
    setPostTags(draft.tags)
    setPostCategory(draft.category)
    setPostVisibility(draft.visibility)

    setKnownTags((prev) => dedupeStrings([...prev, ...draft.tags]).sort((a, b) => a.localeCompare(b)))
    setLocalDraftSavedAt(draft.savedAt || "")
    setPublishStatus(
      {
        tone: "success",
        text: `브라우저 임시글을 불러왔습니다${draft.savedAt ? ` (${draft.savedAt.slice(11, 16)})` : ""}.`,
      },
      "page"
    )
  }, [
    buildLocalDraftFingerprint,
    dedupeStrings,
    lastLocalDraftFingerprintRef,
    lastWriteFingerprintRef,
    lastWriteIdempotencyKeyRef,
    normalizeCategoryValue,
    readLocalDraft,
    setEditorMode,
    setIsTempDraftMode,
    setKnownTags,
    setLocalDraftSavedAt,
    setPostCategory,
    setPostContent,
    setPostId,
    setPostSummary,
    setPostTags,
    setPostThumbnailFocusX,
    setPostThumbnailFocusY,
    setPostThumbnailUrl,
    setPostThumbnailZoom,
    setPostTitle,
    setPostVersion,
    setPostVisibility,
    setPreviewThumbnailSourceUrl,
    setPublishStatus,
  ])

  const clearLocalDraft = useCallback(() => {
    removeLocalDraft()
    lastLocalDraftFingerprintRef.current = ""
    setLocalDraftSavedAt("")
    setPublishStatus(
      {
        tone: "success",
        text: "브라우저 임시저장을 삭제했습니다.",
      },
      "page"
    )
  }, [lastLocalDraftFingerprintRef, removeLocalDraft, setLocalDraftSavedAt, setPublishStatus])

  const switchToCreateMode = useCallback((options?: { keepContent?: boolean }) => {
    const keepContent = options?.keepContent ?? true
    activateComposeSurface()
    setEditorMode("create")
    setIsTempDraftMode(false)
    setPostId("")
    setPostVersion(null)
    setPreviewThumbnailSourceUrl("")
    serverBaselineEditorFingerprintRef.current = ""
    lastWriteFingerprintRef.current = ""
    lastWriteIdempotencyKeyRef.current = ""
    if (!keepContent) {
      setPostTitle("")
      setPostContent("")
      setPostSummary("")
      setPostThumbnailUrl("")
      setPostThumbnailFocusX(defaultThumbnailFocusX)
      setPostThumbnailFocusY(defaultThumbnailFocusY)
      setPostThumbnailZoom(defaultThumbnailZoom)
      setPostTags([])
      setPostCategory("")
    }
    setPublishStatus(
      {
        tone: "idle",
        text: "새 글 모드입니다. 글 작성 버튼은 새 글 생성에만 사용됩니다.",
      },
      "page"
    )
    if (isCompactMobileLayout) {
      setMobileComposeStep("edit")
    }
  }, [
    activateComposeSurface,
    defaultThumbnailFocusX,
    defaultThumbnailFocusY,
    defaultThumbnailZoom,
    isCompactMobileLayout,
    lastWriteFingerprintRef,
    lastWriteIdempotencyKeyRef,
    serverBaselineEditorFingerprintRef,
    setEditorMode,
    setIsTempDraftMode,
    setMobileComposeStep,
    setPostCategory,
    setPostContent,
    setPostId,
    setPostSummary,
    setPostTags,
    setPostThumbnailFocusX,
    setPostThumbnailFocusY,
    setPostThumbnailUrl,
    setPostThumbnailZoom,
    setPostTitle,
    setPostVersion,
    setPreviewThumbnailSourceUrl,
    setPublishStatus,
  ])

  const applyLoadedPostContext = useCallback((post: PostForEditor) => {
    activateComposeSurface()
    setPostId(String(post.id))
    setPostVersion(typeof post.version === "number" ? post.version : null)
    setEditorMode("edit")
    setIsTempDraftMode(isServerTempDraftPost(post))
    lastWriteFingerprintRef.current = ""
    lastWriteIdempotencyKeyRef.current = ""
    if (isCompactMobileLayout) {
      setMobileComposeStep("edit")
    }
  }, [
    activateComposeSurface,
    isCompactMobileLayout,
    lastWriteFingerprintRef,
    lastWriteIdempotencyKeyRef,
    setEditorMode,
    setIsTempDraftMode,
    setMobileComposeStep,
    setPostId,
    setPostVersion,
  ])

  const loadPostForEditor = useCallback(async (targetPostId: string = postId) => {
    try {
      setLoadingKey("postOne")
      const post = await apiFetch<PostForEditor>(`/post/api/v1/adm/posts/${targetPostId}`)
      let resolvedPost = post

      if ((resolvedPost.content ?? "").trim().length === 0 && resolvedPost.contentHtml) {
        try {
          const publicPost = await apiFetch<Pick<PostForEditor, "content" | "contentHtml">>(
            `/post/api/v1/posts/${targetPostId}`
          )
          if ((publicPost.content ?? "").trim().length > 0 || publicPost.contentHtml) {
            resolvedPost = {
              ...post,
              content: publicPost.content ?? post.content,
              contentHtml: publicPost.contentHtml ?? post.contentHtml,
            }
          }
        } catch {
          // 비공개/삭제 글 등 공개 읽기 폴백이 불가능한 경우 admin payload를 그대로 사용한다.
        }
      }

      const rawSnapshot = resolveEditorMetaSnapshot(
        resolvedPost.content ?? "",
        resolvedPost.contentHtml
      )
      const shouldMaskTempTitle = isServerTempDraftPost(resolvedPost)
      const shouldMaskTempPlaceholder = isBlankServerTempDraft(resolvedPost, rawSnapshot)
      const nextTitle = shouldMaskTempTitle ? "" : resolvedPost.title ?? ""
      const nextVisibility = toVisibility(!!resolvedPost.published, !!resolvedPost.listed)
      const snapshot = shouldMaskTempPlaceholder
        ? (syncEditorMeta("") ?? buildEmptyEditorMetaSnapshot())
        : syncEditorMeta(resolvedPost.content ?? "", resolvedPost.contentHtml)
      setPostTitle(nextTitle)
      setPostVisibility(nextVisibility)
      serverBaselineEditorFingerprintRef.current = buildEditorStateFingerprint({
        title: nextTitle,
        content: snapshot.body,
        summary: snapshot.summary,
        thumbnailUrl: snapshot.thumbnailUrl,
        thumbnailFocusX: snapshot.thumbnailFocusX,
        thumbnailFocusY: snapshot.thumbnailFocusY,
        thumbnailZoom: snapshot.thumbnailZoom,
        tags: snapshot.tags,
        category: snapshot.category,
        visibility: nextVisibility,
      })
      applyLoadedPostContext(resolvedPost)
      setResult(pretty(resolvedPost))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }, [
    applyLoadedPostContext,
    buildEditorStateFingerprint,
    buildEmptyEditorMetaSnapshot,
    isBlankServerTempDraft,
    postId,
    pretty,
    resolveEditorMetaSnapshot,
    serverBaselineEditorFingerprintRef,
    setLoadingKey,
    setPostTitle,
    setPostVisibility,
    setResult,
    syncEditorMeta,
    toVisibility,
  ])

  const loadExistingTempPostForRecovery = useCallback(async (): Promise<PostForEditor | null> => {
    try {
      const data = await apiFetch<PageDto<AdminPostListItem>>(
        "/post/api/v1/adm/posts?page=1&pageSize=30&kw=&sort=MODIFIED_AT"
      )
      const tempRow = (data.content || []).find((row) => isServerTempDraftPost(row) && !row.deletedAt)
      if (!tempRow?.id) return null
      return await apiFetch<PostForEditor>(`/post/api/v1/adm/posts/${tempRow.id}`)
    } catch {
      return null
    }
  }, [])

  const handleLoadOrCreateTempPost = useCallback(async (options?: {
    redirectToEditor?: boolean
    source?: string
    returnTo?: string
  }) => {
    try {
      setLoadingKey("postTemp")
      setPublishStatus({ tone: "loading", text: "새 글을 준비하고 있습니다..." }, "page")
      if (!tempPostRequestRef.current) {
        tempPostRequestRef.current = requestTempPostWithConflictRetry(loadExistingTempPostForRecovery).finally(() => {
          tempPostRequestRef.current = null
        })
      }
      const response = await tempPostRequestRef.current
      const tempPost = response.data
      if (options?.redirectToEditor && tempPost.id) {
        const query = new URLSearchParams()
        if (options.source) query.set("source", options.source)
        if (options.returnTo) query.set("returnTo", options.returnTo)
        const destination =
          query.size > 0
            ? `${toEditorPostRoute(tempPost.id)}?${query.toString()}`
            : toEditorPostRoute(tempPost.id)
        await replaceRoute(router, destination)
        return
      }
      const rawSnapshot = resolveEditorMetaSnapshot(tempPost.content ?? "", tempPost.contentHtml)
      const shouldMaskTempTitle = isServerTempDraftPost(tempPost)
      const shouldMaskTempPlaceholder = isBlankServerTempDraft(tempPost, rawSnapshot)
      const nextTitle = shouldMaskTempTitle ? "" : tempPost.title ?? ""
      const nextVisibility = toVisibility(!!tempPost.published, !!tempPost.listed)
      const snapshot = shouldMaskTempPlaceholder
        ? (syncEditorMeta("") ?? buildEmptyEditorMetaSnapshot())
        : syncEditorMeta(tempPost.content ?? "", tempPost.contentHtml)
      setPostTitle(nextTitle)
      setPostVisibility(nextVisibility)
      serverBaselineEditorFingerprintRef.current = buildEditorStateFingerprint({
        title: nextTitle,
        content: snapshot.body,
        summary: snapshot.summary,
        thumbnailUrl: snapshot.thumbnailUrl,
        thumbnailFocusX: snapshot.thumbnailFocusX,
        thumbnailFocusY: snapshot.thumbnailFocusY,
        thumbnailZoom: snapshot.thumbnailZoom,
        tags: snapshot.tags,
        category: snapshot.category,
        visibility: nextVisibility,
      })
      applyLoadedPostContext(tempPost)
      setIsTempDraftMode(true)
      setPublishStatus(
        {
          tone: "success",
          text: shouldMaskTempPlaceholder ? "새 글을 시작할 수 있습니다." : "저장된 임시 저장본을 불러왔습니다.",
        },
        "page"
      )
      if (isCompactMobileLayout) {
        setMobileComposeStep("edit")
      }
      setResult(pretty(response))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPublishStatus({ tone: "error", text: `새 글 불러오기 실패: ${message}` }, "page")
      setResult(pretty({ error: message }))
      setIsNewEditorBootstrapPending(false)
    } finally {
      setLoadingKey("")
    }
  }, [
    applyLoadedPostContext,
    buildEditorStateFingerprint,
    buildEmptyEditorMetaSnapshot,
    isBlankServerTempDraft,
    isCompactMobileLayout,
    pretty,
    requestTempPostWithConflictRetry,
    resolveEditorMetaSnapshot,
    router,
    serverBaselineEditorFingerprintRef,
    setIsNewEditorBootstrapPending,
    setIsTempDraftMode,
    setLoadingKey,
    setMobileComposeStep,
    setPostTitle,
    setPostVisibility,
    setPublishStatus,
    setResult,
    syncEditorMeta,
    tempPostRequestRef,
    toEditorPostRoute,
    toVisibility,
    loadExistingTempPostForRecovery,
  ])

  useEffect(() => {
    const localDraft = readLocalDraft()
    if (!localDraft?.savedAt) return

    lastLocalDraftFingerprintRef.current = buildLocalDraftFingerprint({
      title: localDraft.title,
      content: localDraft.content,
      summary: localDraft.summary,
      thumbnailUrl: localDraft.thumbnailUrl,
      thumbnailFocusX: localDraft.thumbnailFocusX,
      thumbnailFocusY: localDraft.thumbnailFocusY,
      thumbnailZoom: localDraft.thumbnailZoom,
      tags: dedupeStrings(localDraft.tags),
      category: localDraft.category ? normalizeCategoryValue(localDraft.category) : "",
      visibility: localDraft.visibility,
    })
    setLocalDraftSavedAt(localDraft.savedAt)
  }, [
    buildLocalDraftFingerprint,
    dedupeStrings,
    lastLocalDraftFingerprintRef,
    normalizeCategoryValue,
    readLocalDraft,
    setLocalDraftSavedAt,
  ])

  useEffect(() => {
    const hasDraftContent =
      postTitle.trim().length > 0 ||
      postContent.trim().length > 0 ||
      postSummary.trim().length > 0 ||
      postThumbnailUrl.trim().length > 0 ||
      postTags.length > 0 ||
      postCategory.trim().length > 0

    if (!hasDraftContent) return
    if (lastLocalDraftFingerprintRef.current === localDraftFingerprint) return

    const timerId = window.setTimeout(() => {
      saveLocalDraft({ silent: true })
    }, 1200)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    lastLocalDraftFingerprintRef,
    localDraftFingerprint,
    postCategory,
    postContent,
    postSummary,
    postTags,
    postThumbnailUrl,
    postTitle,
    saveLocalDraft,
  ])

  return {
    localDraftFingerprint,
    saveLocalDraft,
    restoreLocalDraft,
    clearLocalDraft,
    switchToCreateMode,
    loadPostForEditor,
    handleLoadOrCreateTempPost,
  }
}
