import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/router"
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
  const { data } = useQuery<PostDetail>({
    queryKey: queryKey.post(routeId),
    // This hook reads dehydrated cache populated by getServerSideProps.
    // Network fetching is intentionally disabled on the client.
    enabled: false,
  })

  return data
}

export default usePostQuery
