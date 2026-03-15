import { getCategorySearchText } from "src/libs/utils"
import { TPost } from "src/types"

interface FilterPostsParams {
  posts: TPost[]
  q: string
  tag?: string
  order?: string
}

export function filterPosts({
  posts,
  q,
  tag = undefined,
  order = "desc",
}: FilterPostsParams): TPost[] {
  const normalizedQuery = q.trim().toLowerCase()

  return posts
    .filter((post) => {
      const tagContent = post.tags ? post.tags.join(" ") : ""
      const categoryContent = post.category ? post.category.map(getCategorySearchText).join(" ") : ""
      const summaryContent = post.summary || ""
      const searchContent = [post.title, summaryContent, tagContent, categoryContent].join(" ")
      return (
        searchContent.toLowerCase().includes(normalizedQuery) &&
        (!tag || (post.tags && post.tags.includes(tag)))
      )
    })
    .sort((a, b) => {
      const dateA = new Date(a.date.start_date).getTime()
      const dateB = new Date(b.date.start_date).getTime()
      return order === "desc" ? dateB - dateA : dateA - dateB
    })
}
