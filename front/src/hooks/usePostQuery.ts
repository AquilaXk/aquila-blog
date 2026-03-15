import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/router"
import { getPostDetailById } from "src/apis"
import { queryKey } from "src/constants/queryKey"
import { extractPostIdFromLegacySlug } from "src/libs/utils/postPath"
import { PostDetail } from "src/types"

const usePostQuery = () => {
  const router = useRouter()
  const routeId =
    typeof router.query.id === "string"
      ? router.query.id
      : typeof router.query.slug === "string"
        ? String(extractPostIdFromLegacySlug(router.query.slug) || "")
        : ""
  const query = useQuery<PostDetail | null>({
    queryKey: queryKey.post(routeId),
    queryFn: () => getPostDetailById(routeId),
    enabled: !!routeId,
    retry: 1,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  return {
    post: query.data ?? undefined,
    isLoading: query.isLoading || (query.isFetching && query.data === undefined),
    isNotFound: query.status === "success" && query.data === null,
  }
}

export default usePostQuery
