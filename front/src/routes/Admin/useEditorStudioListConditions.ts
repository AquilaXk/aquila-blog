import type { ChangeEvent } from "react"
import { useCallback, useEffect, useState } from "react"

export type PostListScope = "active" | "deleted"
export type ListQuickPreset = "none" | "today" | "temp"

const LIST_CONDITION_STORAGE_KEY = "admin.contentStudio.listConditions.v1"

export const LIST_SORT_OPTIONS = [
  { value: "CREATED_AT", label: "최신순" },
  { value: "CREATED_AT_ASC", label: "오래된순" },
] as const

const sanitizeNumberInput = (value: string) => value.replace(/[^\d]/g, "")

export const useEditorStudioListConditions = () => {
  const [listPage, setListPage] = useState("1")
  const [listPageSize, setListPageSize] = useState("30")
  const [listKw, setListKw] = useState("")
  const [listSort, setListSort] = useState("CREATED_AT")
  const [listScope, setListScope] = useState<PostListScope>("active")
  const [listQuickPreset, setListQuickPreset] = useState<ListQuickPreset>("none")
  const [isListAdvancedOpen, setIsListAdvancedOpen] = useState(false)

  const handleListPageChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setListPage(sanitizeNumberInput(event.target.value))
  }, [])

  const handleListPageSizeChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setListPageSize(sanitizeNumberInput(event.target.value))
  }, [])

  const handleListSortChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setListSort(event.target.value)
  }, [])

  const applyListQuickPreset = useCallback((preset: ListQuickPreset) => {
    setListScope("active")
    setListPage("1")
    setListPageSize("30")
    if (preset === "today") {
      setListKw("")
      setListSort("CREATED_AT")
    } else if (preset === "temp") {
      setListKw("")
      setListSort("MODIFIED_AT")
    }
    setListQuickPreset(preset)
  }, [])

  const resetListFilters = useCallback(() => {
    setListQuickPreset("none")
    setListKw("")
    setListPage("1")
    setListPageSize("30")
    setListSort("CREATED_AT")
  }, [])

  const toggleListAdvanced = useCallback(() => {
    setIsListAdvancedOpen((prev) => !prev)
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LIST_CONDITION_STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as Partial<{
        page: string
        pageSize: string
        kw: string
        sort: string
        scope: PostListScope
        preset: ListQuickPreset
      }>
      if (typeof parsed.page === "string") setListPage(sanitizeNumberInput(parsed.page) || "1")
      if (typeof parsed.pageSize === "string") setListPageSize(sanitizeNumberInput(parsed.pageSize) || "30")
      if (typeof parsed.kw === "string") setListKw(parsed.kw)
      if (typeof parsed.sort === "string") {
        const hasOption = LIST_SORT_OPTIONS.some((option) => option.value === parsed.sort)
        setListSort(hasOption ? parsed.sort : LIST_SORT_OPTIONS[0].value)
      }
      if (parsed.scope === "active" || parsed.scope === "deleted") setListScope(parsed.scope)
      if (parsed.preset === "none" || parsed.preset === "today" || parsed.preset === "temp") {
        setListQuickPreset(parsed.preset)
      }
    } catch {
      // noop: 깨진 저장값은 무시하고 기본값 사용
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      LIST_CONDITION_STORAGE_KEY,
      JSON.stringify({
        page: listPage,
        pageSize: listPageSize,
        kw: listKw,
        sort: listSort,
        scope: listScope,
        preset: listQuickPreset,
      })
    )
  }, [listKw, listPage, listPageSize, listQuickPreset, listScope, listSort])

  return {
    listPage,
    setListPage,
    listPageSize,
    setListPageSize,
    listKw,
    setListKw,
    listSort,
    setListSort,
    listScope,
    setListScope,
    listQuickPreset,
    setListQuickPreset,
    isListAdvancedOpen,
    setIsListAdvancedOpen,
    handleListPageChange,
    handleListPageSizeChange,
    handleListSortChange,
    applyListQuickPreset,
    resetListFilters,
    toggleListAdvanced,
  }
}
