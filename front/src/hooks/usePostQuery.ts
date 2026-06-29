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

const isPostDetailResult = (
  value: ApiFetchResult<PostDetail | null> | PostDetail | null | undefined
): value is ApiFetchResult<PostDetail | null> =>
  typeof value === "object" &&
  value !== null &&
  "data" in value &&
  "meta" in value &&
  typeof value.meta === "object" &&
  value.meta !== null &&
  "stale" in value.meta

const usePostQuery = () => {
  const router = useRouter()
  const routeId =
    typeof router.query.id === "string"
      ? router.query.id
      : extractCanonicalPostIdFromAsPath(router.asPath || "")
  const hasRouteId = routeId.length > 0
  const query = useQuery<ApiFetchResult<PostDetail | null> | PostDetail | null>({
    queryKey: queryKey.post(routeId),
    queryFn: () => getPostDetailByIdWithMeta(routeId),
    enabled: hasRouteId,
    retry: 1,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
  const post = isPostDetailResult(query.data) ? query.data.data : (query.data ?? null)
  const staleMeta = isPostDetailResult(query.data) ? query.data.meta : null

  return {
    post: post ?? undefined,
    staleMeta,
    isLoading: !hasRouteId || query.isLoading || (query.isFetching && query.data === undefined),
    isNotFound: hasRouteId && query.status === "success" && post === null,
  }
}

export default usePostQuery
