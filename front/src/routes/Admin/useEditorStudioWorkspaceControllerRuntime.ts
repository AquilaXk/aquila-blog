import type { QueryClient } from "@tanstack/react-query"
import type { NextRouter } from "next/router"
import {
  type ChangeEvent,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react"
import { invalidatePublicPostReadCaches } from "src/apis/backend/posts"
import { pushRoute } from "src/libs/router"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import {
  buildCanonicalPostUrl,
  isComposingKeyboardEvent,
  pretty,
  syncTitleTextareaHeight,
  type JsonValue,
  type NoticeState,
} from "./EditorStudioWorkspaceControllerRootModel"
import type { EditorMode, PublishActionType } from "./editorStudioState"

type PublishNoticeTarget = "auto" | "page" | "modal"

type UseEditorStudioWorkspaceControllerRuntimeArgs = {
  isPublishModalOpen: boolean
  loadingKey: string
  postId: string
  postTitle: string
  queryClient: QueryClient
  router: NextRouter
  setEditorMode: Dispatch<SetStateAction<EditorMode>>
  setGlobalNotice: Dispatch<SetStateAction<NoticeState>>
  setIsTempDraftMode: Dispatch<SetStateAction<boolean>>
  setLoadingKey: Dispatch<SetStateAction<string>>
  setPostId: Dispatch<SetStateAction<string>>
  setPostTitle: Dispatch<SetStateAction<string>>
  setPostVersion: Dispatch<SetStateAction<number | null>>
  setPublishModalNotice: Dispatch<SetStateAction<NoticeState>>
  setPublishNotice: Dispatch<SetStateAction<NoticeState>>
  setResult: Dispatch<SetStateAction<string>>
}

export const useEditorStudioWorkspaceControllerRuntime = ({
  isPublishModalOpen,
  loadingKey,
  postId,
  postTitle,
  queryClient,
  router,
  setEditorMode,
  setGlobalNotice,
  setIsTempDraftMode,
  setLoadingKey,
  setPostId,
  setPostTitle,
  setPostVersion,
  setPublishModalNotice,
  setPublishNotice,
  setResult,
}: UseEditorStudioWorkspaceControllerRuntimeArgs) => {
  const titleFieldRef = useRef<HTMLTextAreaElement | null>(null)

  const refreshPublicPostReadViews = useCallback(async (affectedPostId?: string | number) => {
    const resolvedPostId =
      typeof affectedPostId === "number"
        ? affectedPostId
        : typeof affectedPostId === "string"
          ? affectedPostId.trim()
          : postId.trim()

    await invalidatePublicPostReadCaches(queryClient, resolvedPostId || undefined)
    if (!resolvedPostId) return

    const revalidateResponse = await fetch("/api/revalidate", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paths: [toCanonicalPostPath(resolvedPostId)],
      }),
    })

    if (!revalidateResponse.ok) {
      const reason = (await revalidateResponse.text().catch(() => "")).trim()
      throw new Error(reason || "공개 상세 재검증 요청에 실패했습니다.")
    }
  }, [postId, queryClient])

  const run = useCallback(async (key: string, fn: () => Promise<JsonValue>) => {
    try {
      setLoadingKey(key)
      setGlobalNotice({ tone: "loading", text: `작업 실행 중: ${key}` })
      const data = await fn()
      setResult(pretty(data))
      setGlobalNotice({ tone: "success", text: `작업 완료: ${key}` })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setResult(pretty({ error: message }))
      setGlobalNotice({ tone: "error", text: `작업 실패: ${message}` })
    } finally {
      setLoadingKey("")
    }
  }, [setGlobalNotice, setLoadingKey, setResult])

  const disabled = useCallback((key: string) => loadingKey.length > 0 && loadingKey !== key, [loadingKey])

  const handleTitleFieldRef = useCallback((node: HTMLTextAreaElement | null) => {
    titleFieldRef.current = node
    syncTitleTextareaHeight(node)
  }, [])

  const handleTitleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setPostTitle(event.target.value.replace(/\r\n?/g, "\n"))
    syncTitleTextareaHeight(event.target)
  }, [setPostTitle])

  const handleTitleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposingKeyboardEvent(event)) return
    if (event.key === "Enter") {
      event.preventDefault()
    }
  }, [])

  useEffect(() => {
    syncTitleTextareaHeight(titleFieldRef.current)
  }, [postTitle])

  const handleSelectedPostIdChange = useCallback(
    (nextPostId: string) => {
      const normalizedPostId = nextPostId.trim()
      setPostId(normalizedPostId)
      if (normalizedPostId !== postId.trim()) {
        setEditorMode("create")
        setPostVersion(null)
        setIsTempDraftMode(false)
      }
    },
    [postId, setEditorMode, setIsTempDraftMode, setPostId, setPostVersion]
  )

  const publishModalHintByAction = useCallback((actionType: PublishActionType): string => {
    if (actionType === "create") return "작성 전 확인이 필요한 항목만 이곳에 표시됩니다."
    if (actionType === "modify") return "수정 전 확인이 필요한 항목만 이곳에 표시됩니다."
    return "새 글 작성 전 확인이 필요한 항목만 이곳에 표시됩니다."
  }, [])

  const setPublishStatus = useCallback(
    (next: NoticeState, target: PublishNoticeTarget = "auto") => {
      setGlobalNotice(next)
      if (target === "page") {
        setPublishNotice(next)
        return
      }

      if (target === "modal") {
        setPublishModalNotice(next)
        return
      }

      if (isPublishModalOpen) {
        setPublishModalNotice(next)
        return
      }

      setPublishNotice(next)
    },
    [isPublishModalOpen, setGlobalNotice, setPublishModalNotice, setPublishNotice]
  )

  const openPostDetailRoute = useCallback(
    async (targetPostId: string | number) => {
      const resolvedPostId = String(targetPostId).trim()
      if (!resolvedPostId) {
        setPublishStatus({ tone: "error", text: "상세 링크를 열 글 ID가 없습니다." }, "page")
        return
      }

      const path = toCanonicalPostPath(resolvedPostId)
      if (typeof window !== "undefined") {
        const opened = window.open(path, "_blank", "noopener,noreferrer")
        if (opened) return
      }

      try {
        await pushRoute(router, path)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setPublishStatus({ tone: "error", text: `상세 열기 실패: ${message}` }, "page")
      }
    },
    [router, setPublishStatus]
  )

  const copyPostDetailLink = useCallback(
    async (targetPostId: string | number, title?: string) => {
      const resolvedPostId = String(targetPostId).trim()
      if (!resolvedPostId) {
        setPublishStatus({ tone: "error", text: "복사할 상세 링크가 없습니다." }, "page")
        return
      }

      const rowLabel = `#${resolvedPostId} ${title?.trim() || "제목 없는 글"}`
      const url = buildCanonicalPostUrl(resolvedPostId)

      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url)
          setPublishStatus({ tone: "success", text: `${rowLabel} 링크를 복사했습니다.` }, "page")
          return
        }

        if (typeof window !== "undefined") {
          window.prompt("링크를 복사하세요.", url)
          setPublishStatus({ tone: "success", text: `${rowLabel} 링크를 표시했습니다.` }, "page")
          return
        }

        throw new Error("링크를 복사할 수 없는 환경입니다.")
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setPublishStatus({ tone: "error", text: `링크 복사 실패: ${message}` }, "page")
      }
    },
    [setPublishStatus]
  )

  return {
    copyPostDetailLink,
    disabled,
    handleSelectedPostIdChange,
    handleTitleChange,
    handleTitleFieldRef,
    handleTitleKeyDown,
    openPostDetailRoute,
    publishModalHintByAction,
    refreshPublicPostReadViews,
    run,
    setPublishStatus,
  }
}
