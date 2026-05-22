import { useCallback, type Dispatch, type SetStateAction } from "react"
import { apiFetch } from "src/apis/backend/client"
import {
  PREVIEW_SUMMARY_MAX_CONTENT_LENGTH,
  dedupeStrings,
  formatTagRecommendationReason,
  normalizeRecommendedTags,
  resolveTagRecommendationErrorMessage,
  type MetaUsageMap,
} from "./editorStudioMetaModel"

type NoticeState = {
  tone: "idle" | "loading" | "success" | "error"
  text: string
}

type RsData<T> = {
  data: T
  msg: string
}

type RecommendTagsPayload = {
  tags?: string[]
  provider?: string
  model?: string | null
  reason?: string | null
  degraded?: boolean
  traceId?: string | null
}

type TagUsageDto = {
  tag: string
  count: number
}

type UseEditorStudioMetaCatalogParams = {
  customTagCatalog: string[]
  postContent: string
  postTags: string[]
  postTitle: string
  tagUsageMap: MetaUsageMap
  setCustomTagCatalog: Dispatch<SetStateAction<string[]>>
  setKnownTags: Dispatch<SetStateAction<string[]>>
  setLoadingKey: Dispatch<SetStateAction<string>>
  setMetaCatalogLoading: Dispatch<SetStateAction<boolean>>
  setMetaNotice: Dispatch<SetStateAction<NoticeState>>
  setPostTags: Dispatch<SetStateAction<string[]>>
  setTagDraft: Dispatch<SetStateAction<string>>
  setTagRecommendationNotice: Dispatch<SetStateAction<NoticeState>>
  setTagUsageMap: Dispatch<SetStateAction<MetaUsageMap>>
}

const fetchRecommendedTags = async (
  payload: {
    title: string
    content: string
    existingTags: string[]
    maxTags: number
  }
): Promise<RsData<RecommendTagsPayload>> => {
  const controller = new AbortController()
  const timeoutMs = 12_000
  const timeoutId = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs)

  try {
    const response = await fetch("/api/post/recommend-tags", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const raw = await response.text().catch(() => "")
      if (raw) {
        let parsedMessage = ""
        try {
          const parsed = JSON.parse(raw) as { msg?: unknown; message?: unknown }
          const msg = typeof parsed.msg === "string" ? parsed.msg.trim() : ""
          const message = typeof parsed.message === "string" ? parsed.message.trim() : ""
          parsedMessage = msg || message
        } catch {}
        throw new Error(parsedMessage || `status=${response.status}`)
      }
      throw new Error(`status=${response.status}`)
    }

    return (await response.json()) as RsData<RecommendTagsPayload>
  } catch (error) {
    if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new Error("태그 추천 응답 대기 시간이 초과되었습니다.")
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export const useEditorStudioMetaCatalog = ({
  customTagCatalog,
  postContent,
  postTags,
  postTitle,
  setCustomTagCatalog,
  setKnownTags,
  setLoadingKey,
  setMetaCatalogLoading,
  setMetaNotice,
  setPostTags,
  setTagDraft,
  setTagRecommendationNotice,
  setTagUsageMap,
  tagUsageMap,
}: UseEditorStudioMetaCatalogParams) => {
  const refreshEditorMetaCatalog = useCallback(async () => {
    setMetaCatalogLoading(true)

    try {
      const nextTagUsageMap: MetaUsageMap = {}
      const tagRows = await apiFetch<TagUsageDto[]>("/post/api/v1/posts/tags").catch(() => [] as TagUsageDto[])

      tagRows.forEach((row) => {
        const key = typeof row.tag === "string" ? row.tag.trim() : ""
        if (!key) return
        nextTagUsageMap[key] = Number.isFinite(row.count) ? row.count : 0
      })

      setTagUsageMap(nextTagUsageMap)
      setKnownTags(
        dedupeStrings([...Object.keys(nextTagUsageMap), ...customTagCatalog]).sort((a, b) =>
          a.localeCompare(b)
        )
      )
    } finally {
      setMetaCatalogLoading(false)
    }
  }, [customTagCatalog, setKnownTags, setMetaCatalogLoading, setTagUsageMap])

  const addTagsToPost = useCallback((values: string[]) => {
    const normalizedTags = dedupeStrings(values.map((value) => value.trim()).filter(Boolean))
    if (normalizedTags.length === 0) return []

    setPostTags((prev) => dedupeStrings([...prev, ...normalizedTags]))
    setKnownTags((prev) => dedupeStrings([...prev, ...normalizedTags]).sort((a, b) => a.localeCompare(b)))
    setCustomTagCatalog((prev) => dedupeStrings([...prev, ...normalizedTags]).sort((a, b) => a.localeCompare(b)))
    setMetaNotice({
      tone: "success",
      text:
        normalizedTags.length === 1
          ? `태그 "${normalizedTags[0]}"를 추가했습니다. 현재 글에서 바로 사용할 수 있습니다.`
          : `태그 ${normalizedTags.length}개를 추가했습니다. 현재 글에서 바로 사용할 수 있습니다.`,
    })

    return normalizedTags
  }, [setCustomTagCatalog, setKnownTags, setMetaNotice, setPostTags])

  const addTagToPost = useCallback((value: string) => {
    const added = addTagsToPost([value])
    if (added.length > 0) setTagDraft("")
  }, [addTagsToPost, setTagDraft])

  const removeTagFromPost = useCallback((value: string) => {
    setPostTags((prev) => prev.filter((tag) => tag !== value))
  }, [setPostTags])

  const deleteTagFromCatalog = useCallback((tag: string) => {
    const usageCount = tagUsageMap[tag] || 0

    if (usageCount > 0) {
      setMetaNotice({
        tone: "error",
        text: `사용 중인 태그 "${tag}"는 삭제할 수 없습니다. 현재 ${usageCount}개 글에서 사용 중입니다.`,
      })
      return
    }

    setCustomTagCatalog((prev) => prev.filter((item) => item !== tag))
    setKnownTags((prev) => prev.filter((item) => item !== tag))
    setPostTags((prev) => prev.filter((item) => item !== tag))
    setMetaNotice({
      tone: "success",
      text: `태그 "${tag}"를 카탈로그에서 삭제했습니다.`,
    })
  }, [setCustomTagCatalog, setKnownTags, setMetaNotice, setPostTags, tagUsageMap])

  const handleRecommendTags = useCallback(async () => {
    const content = postContent.trim()
    if (!content) {
      setTagRecommendationNotice({ tone: "error", text: "본문을 먼저 입력한 뒤 태그 추천을 실행해주세요." })
      return
    }
    if (content.length > PREVIEW_SUMMARY_MAX_CONTENT_LENGTH) {
      const message = `태그 추천용 본문은 최대 ${PREVIEW_SUMMARY_MAX_CONTENT_LENGTH.toLocaleString()}자까지 지원됩니다.`
      setTagRecommendationNotice({ tone: "error", text: message })
      return
    }

    try {
      setLoadingKey("recommendTags")
      setTagRecommendationNotice({ tone: "loading", text: "AI 태그 추천 생성 중입니다..." })

      const response = await fetchRecommendedTags({
        title: postTitle,
        content: postContent,
        existingTags: postTags,
        maxTags: 6,
      })

      const recommended = normalizeRecommendedTags(response?.data?.tags, 6)
      if (recommended.length === 0) {
        throw new Error("태그 추천 결과가 비어 있습니다.")
      }

      const currentTagSet = new Set(postTags.map((tag) => tag.toLowerCase()))
      const tagsToAdd = recommended.filter((tag) => !currentTagSet.has(tag.toLowerCase()))
      if (tagsToAdd.length > 0) {
        setPostTags((prev) => dedupeStrings([...prev, ...tagsToAdd]))
        setKnownTags((prev) => dedupeStrings([...prev, ...tagsToAdd]).sort((a, b) => a.localeCompare(b)))
        setCustomTagCatalog((prev) => dedupeStrings([...prev, ...tagsToAdd]).sort((a, b) => a.localeCompare(b)))
      }

      const isRuleFallback = response?.data?.provider === "rule"
      const traceHint = response?.data?.traceId ? ` · trace=${response.data.traceId}` : ""
      const reasonHint =
        response?.data?.provider === "rule" ? formatTagRecommendationReason(response?.data?.reason) : ""

      if (isRuleFallback) {
        const fallbackNoticeText = `규칙 기반 태그 추천 반영 (${reasonHint || "AI 태그 추천 실패"})${traceHint}`
        setTagRecommendationNotice({ tone: "error", text: fallbackNoticeText })
        return
      }

      if (tagsToAdd.length === 0) {
        setTagRecommendationNotice({
          tone: "success",
          text: `AI 추천 태그가 이미 모두 적용된 상태입니다.${traceHint}`,
        })
        return
      }

      const tagNoticeText = `태그 ${tagsToAdd.length}개를 추천 반영했습니다.${traceHint}`
      setTagRecommendationNotice({ tone: "success", text: tagNoticeText })
    } catch (error) {
      const errorMessage = resolveTagRecommendationErrorMessage(error)
      const failMessage = `태그 추천 실패: ${errorMessage}`
      setTagRecommendationNotice({ tone: "error", text: failMessage })
    } finally {
      setLoadingKey("")
    }
  }, [
    postContent,
    postTags,
    postTitle,
    setCustomTagCatalog,
    setKnownTags,
    setLoadingKey,
    setPostTags,
    setTagRecommendationNotice,
  ])

  return {
    addTagsToPost,
    addTagToPost,
    deleteTagFromCatalog,
    handleRecommendTags,
    refreshEditorMetaCatalog,
    removeTagFromPost,
  }
}
