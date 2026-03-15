import { useQuery } from "@tanstack/react-query"
import { getTagCounts } from "src/apis/backend/posts"
import { queryKey } from "src/constants/queryKey"

export const useTagsQuery = () => {
  const { data } = useQuery<Record<string, number>>({
    queryKey: queryKey.tags(),
    queryFn: getTagCounts,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  return data ?? {}
}
