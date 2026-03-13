import { DEFAULT_CATEGORY } from "src/constants"
import { useMemo } from "react"
import usePostsQuery from "./usePostsQuery"
import { getAllSelectItemsFromPosts } from "src/libs/utils/notion"

export const useCategoriesQuery = () => {
  const posts = usePostsQuery()
  const categories = useMemo(() => getAllSelectItemsFromPosts("category", posts), [posts])

  return useMemo(
    () => ({
      [DEFAULT_CATEGORY]: posts.length,
      ...categories,
    }),
    [categories, posts.length]
  )
}
