import { useQuery } from "@tanstack/react-query"
import { getFeedPosts } from "src/apis/backend/posts"
import { queryKey } from "src/constants/queryKey"
import { TPost } from "src/types"

const usePostsQuery = () => {
  const { data } = useQuery<TPost[]>({
    queryKey: queryKey.posts(),
    queryFn: () => getFeedPosts({ page: 1, pageSize: 30 }),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
    enabled: true,
  })

  if (!data) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[usePostsQuery] posts cache is missing, fallback to empty list")
    }
    return [] as TPost[]
  }

  return data
}

export default usePostsQuery
