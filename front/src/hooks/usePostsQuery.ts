import { useQuery } from "@tanstack/react-query"
import { queryKey } from "src/constants/queryKey"
import { TPost } from "src/types"

const usePostsQuery = () => {
  const { data } = useQuery({
    queryKey: queryKey.posts(),
    initialData: [] as TPost[],
    enabled: false,
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
