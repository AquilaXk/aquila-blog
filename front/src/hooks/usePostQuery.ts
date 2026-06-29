import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/router"
import { getPostDetailByIdWithMeta } from "src/apis/backend/posts/PostApiDetailRequests"
import { queryKey } from "src/constants/queryKey"
import { PostDetail } from "src/types"
import type { ApiFetchResult } from "src/apis/backend/client"

const extractCanonicalPostIdFromAsPath = (asPath: string): string => {
  const pathname = asPath.split(/[?#]/, 1)[0] || ""
  const canonicalMatch = pathname.match(/^\/posts\/(\d+)(?:\/)?$/)
  return canonicalMatch ? canonicalMatch[1] : ""
}

const usePostQuery = () => {
  const router = useRouter()
  const routeId =
    typeof router.query.id === "string"
      ? router.query.id
      : extractCanonicalPostIdFromAsPath(router.asPath || "")
  const hasRouteId = routeId.length > 0
  const query = useQuery<ApiFetchResult<PostDetail | null>>({
    queryKey: queryKey.post(routeId),
    queryFn: () => getPostDetailByIdWithMeta(routeId),
    enabled: hasRouteId,
    retry: 1,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  return {
    post: query.data?.data ?? undefined,
    staleMeta: query.data?.meta ?? null,
    isLoading: !hasRouteId || query.isLoading || (query.isFetching && query.data === undefined),
    isNotFound: hasRouteId && query.status === "success" && query.data?.data === null,
  }
}

export default usePostQuery
