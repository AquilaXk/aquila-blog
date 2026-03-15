import { useQuery } from "@tanstack/react-query"
import { getExplorePostsTotalCount } from "src/apis/backend/posts"
import { queryKey } from "src/constants/queryKey"

export const usePostsTotalCountQuery = () => {
  const { data } = useQuery<number>({
    queryKey: queryKey.postsTotalCount(),
    queryFn: getExplorePostsTotalCount,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  return typeof data === "number" && Number.isFinite(data) ? data : null
}

