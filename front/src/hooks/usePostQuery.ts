import { useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/router"
import { getPostDetailByIdWithMeta } from "src/apis/backend/posts/PostApiDetailRequests"
import { queryKey } from "src/constants/queryKey"
import { PostDetail } from "src/types"
import type { ApiFetchMeta } from "src/apis/backend/client"

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
  const activeRouteIdRef = useRef(routeId)
  const staleMetaRef = useRef<ApiFetchMeta | null>(null)

  useEffect(() => {
    activeRouteIdRef.current = routeId
    staleMetaRef.current = null
  }, [routeId])

  const query = useQuery<PostDetail | null>({
    queryKey: queryKey.post(routeId),
    queryFn: async () => {
      const requestedRouteId = routeId
      const result = await getPostDetailByIdWithMeta(requestedRouteId)
      if (activeRouteIdRef.current === requestedRouteId) {
        staleMetaRef.current = result.meta
      }
      return result.data
    },
    enabled: hasRouteId,
    retry: 1,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  return {
    post: query.data ?? undefined,
    staleMeta: staleMetaRef.current,
    isLoading: !hasRouteId || query.isLoading || (query.isFetching && query.data === undefined),
    isNotFound: hasRouteId && query.status === "success" && query.data === null,
  }
}

export default usePostQuery
