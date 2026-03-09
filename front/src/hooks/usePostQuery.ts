import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/router"
import { queryKey } from "src/constants/queryKey"
import { PostDetail } from "src/types"

const usePostQuery = () => {
  const router = useRouter()
  const slug = typeof router.query.slug === "string" ? router.query.slug : ""
  const { data } = useQuery<PostDetail>({
    queryKey: queryKey.post(slug),
    // This hook reads dehydrated cache populated by getStaticProps.
    // Network fetching is intentionally disabled on the client.
    enabled: false,
  })

  return data
}

export default usePostQuery
