import { useQuery } from "@tanstack/react-query"
import { getTagCounts } from "src/apis/backend/posts"
import { queryKey } from "src/constants/queryKey"

type TagEntry = [string, number]

type TagsQueryData = {
  tagCounts: Record<string, number>
  tagEntries: TagEntry[]
  totalCount: number
}

const toTagsQueryData = (tagCounts: Record<string, number>): TagsQueryData => {
  const tagEntries = Object.entries(tagCounts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return a[0].localeCompare(b[0], "ko")
  })

  return {
    tagCounts,
    tagEntries,
    totalCount: tagEntries.reduce((sum, [, count]) => sum + count, 0),
  }
}

const EMPTY_TAGS_QUERY_DATA: TagsQueryData = {
  tagCounts: {},
  tagEntries: [],
  totalCount: 0,
}

export const useTagsQuery = () => {
  const { data } = useQuery({
    queryKey: queryKey.tags(),
    queryFn: getTagCounts,
    select: toTagsQueryData,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  return data ?? EMPTY_TAGS_QUERY_DATA
}
