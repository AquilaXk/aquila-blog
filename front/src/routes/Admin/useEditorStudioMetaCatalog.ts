import { useCallback, type Dispatch, type SetStateAction } from "react"
import { apiFetch } from "src/apis/backend/client"
import {
  dedupeStrings,
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

type TagUsageDto = {
  tag: string
  count: number
}

type UseEditorStudioMetaCatalogParams = {
  customTagCatalog: string[]
  postTags: string[]
  tagUsageMap: MetaUsageMap
  setCustomTagCatalog: Dispatch<SetStateAction<string[]>>
  setKnownTags: Dispatch<SetStateAction<string[]>>
  setMetaCatalogLoading: Dispatch<SetStateAction<boolean>>
  setMetaNotice: Dispatch<SetStateAction<NoticeState>>
  setPostTags: Dispatch<SetStateAction<string[]>>
  setTagDraft: Dispatch<SetStateAction<string>>
  setTagUsageMap: Dispatch<SetStateAction<MetaUsageMap>>
}

export const useEditorStudioMetaCatalog = ({
  customTagCatalog,
  postTags,
  setCustomTagCatalog,
  setKnownTags,
  setMetaCatalogLoading,
  setMetaNotice,
  setPostTags,
  setTagDraft,
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

  return {
    addTagsToPost,
    addTagToPost,
    deleteTagFromCatalog,
    refreshEditorMetaCatalog,
    removeTagFromPost,
  }
}
