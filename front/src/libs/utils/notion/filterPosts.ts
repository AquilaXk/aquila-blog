import { TPosts, TPostStatus, TPostType } from "src/types"

export type FilterPostsOptions = {
  acceptStatus?: TPostStatus[]
  acceptType?: TPostType[]
}

const initialOption: FilterPostsOptions = {
  acceptStatus: ["Public"],
  acceptType: ["Post"],
}

export function filterPosts(
  posts: TPosts,
  options: FilterPostsOptions = initialOption
) {
  const { acceptStatus = ["Public"], acceptType = ["Post"] } = options
  const now = new Date()
  const limitDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  if (!posts || !Array.isArray(posts)) return []

  return posts
    .filter((post) => {
      // 1. 필수 데이터 및 날짜 체크
      if (!post.title || !post.slug) return false

      const postDate = new Date(post?.date?.start_date || post.createdTime)
      const postDateMs = postDate.getTime()
      if (Number.isNaN(postDateMs)) return false
      if (postDateMs > limitDate.getTime()) return false

      return true
    })
    .filter((post) => {
      // 2. Status 체크
      const postStatus = Array.isArray(post.status)
        ? post.status[0]
        : post.status
      if (!postStatus) return false
      return (acceptStatus as string[]).includes(postStatus)
    })
    .filter((post) => {
      // 3. Type 체크
      const postType = Array.isArray(post.type) ? post.type[0] : post.type
      if (!postType) return false
      return (acceptType as string[]).includes(postType)
    })
}
