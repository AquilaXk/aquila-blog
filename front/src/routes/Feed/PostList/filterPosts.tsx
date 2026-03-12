import { DEFAULT_CATEGORY } from "src/constants"
import { getCategorySearchText, normalizeCategoryValue } from "src/libs/utils"
import { TPost } from "src/types"

interface FilterPostsParams {
  posts: TPost[]
  q: string
  tag?: string
  category?: string
  order?: string
}

export function filterPosts({
  posts,
  q,
  tag = undefined,
  category = DEFAULT_CATEGORY,
  order = "desc",
}: FilterPostsParams): TPost[] {
  const normalizedQuery = q.trim().toLowerCase()
  const normalizedCategory = normalizeCategoryValue(category)

  return posts
    .filter((post) => {
      const tagContent = post.tags ? post.tags.join(" ") : ""
      const categoryContent = post.category ? post.category.map(getCategorySearchText).join(" ") : ""
      const summaryContent = post.summary || ""
      const searchContent = [post.title, summaryContent, tagContent, categoryContent].join(" ")
      return (
        searchContent.toLowerCase().includes(normalizedQuery) &&
        (!tag || (post.tags && post.tags.includes(tag))) &&
        (normalizedCategory === DEFAULT_CATEGORY ||
          (post.category && post.category.includes(normalizedCategory)))
      )
    })
    .sort((a, b) => {
      const dateA = new Date(a.date.start_date).getTime()
      const dateB = new Date(b.date.start_date).getTime()
      return order === "desc" ? dateB - dateA : dateA - dateB
    })
}
