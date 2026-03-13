import { useMemo } from "react"
import usePostsQuery from "./usePostsQuery"
import { getAllSelectItemsFromPosts } from "src/libs/utils/notion"

export const useTagsQuery = () => {
  const posts = usePostsQuery()
  return useMemo(() => getAllSelectItemsFromPosts("tags", posts), [posts])
}
