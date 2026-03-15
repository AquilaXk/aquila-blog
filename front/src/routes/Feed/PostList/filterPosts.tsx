import { getCategorySearchText } from "src/libs/utils"
import { TPost } from "src/types"

export type FeedPostIndexEntry = {
  post: TPost
  searchableText: string
  timestamp: number
  tags: Set<string>
}

interface FilterPostsParams {
  posts?: TPost[]
  index?: FeedPostIndexEntry[]
  q: string
  tag?: string
  order?: string
}

const toSafeTimestamp = (post: TPost) => {
  const rawDate = post.date?.start_date || post.createdTime
  const parsed = Date.parse(rawDate)
  return Number.isFinite(parsed) ? parsed : 0
}

const toSearchableText = (post: TPost) => {
  const tagContent = post.tags ? post.tags.join(" ") : ""
  const categoryContent = post.category ? post.category.map(getCategorySearchText).join(" ") : ""
  const summaryContent = post.summary || ""
  return [post.title, summaryContent, tagContent, categoryContent].join(" ").toLowerCase()
}

export const createFeedPostIndex = (posts: TPost[]): FeedPostIndexEntry[] =>
  posts.map((post) => ({
    post,
    searchableText: toSearchableText(post),
    timestamp: toSafeTimestamp(post),
    tags: new Set(post.tags || []),
  }))

export function filterPosts({
  posts = [],
  index,
  q,
  tag = undefined,
  order = "desc",
}: FilterPostsParams): TPost[] {
  const normalizedQuery = q.trim().toLowerCase()
  const sourceIndex = index || createFeedPostIndex(posts)

  return sourceIndex
    .filter((entry) => {
      const queryMatches = entry.searchableText.includes(normalizedQuery)
      const tagMatches = !tag || entry.tags.has(tag)
      return queryMatches && tagMatches
    })
    .sort((a, b) => {
      return order === "desc" ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
    })
    .map((entry) => entry.post)
}
