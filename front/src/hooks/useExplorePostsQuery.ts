import { useQuery } from "@tanstack/react-query"
import { getExplorePosts } from "src/apis/backend/posts"
import { queryKey } from "src/constants/queryKey"
import { TPost } from "src/types"

type Params = {
  kw: string
  tag?: string
  page?: number
  pageSize?: number
}

const useExplorePostsQuery = ({
  kw,
  tag,
  page = 1,
  pageSize = 30,
}: Params) => {
  const { data } = useQuery<TPost[]>({
    queryKey: queryKey.postsExplore({
      kw,
      tag,
      page,
      pageSize,
    }),
    queryFn: () =>
      getExplorePosts({
        kw,
        tag,
        page,
        pageSize,
      }),
    staleTime: 30_000,
    keepPreviousData: true,
    retry: 1,
    refetchOnWindowFocus: false,
    enabled: true,
  })

  return data ?? []
}

export default useExplorePostsQuery
