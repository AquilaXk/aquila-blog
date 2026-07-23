import Link from "next/link"
import { formatDate } from "src/libs/utils"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import type { TPost } from "src/types"
import { RelatedSection, RelatedSkeletonItem } from "./PostDetail.styles"

const RELATED_SKELETON_COUNT = 2

type RelatedPostsSectionProps = {
  relatedTag: string
  showRelatedTagSkeleton: boolean
  relatedByTagPosts: TPost[]
  showRelatedAuthorSkeleton: boolean
  relatedByAuthorPosts: TPost[]
}

const renderSkeletonItems = (prefix: string) =>
  Array.from({ length: RELATED_SKELETON_COUNT }, (_, index) => (
    <RelatedSkeletonItem key={`${prefix}-skeleton-${index}`} aria-hidden="true">
      <span className="titleLine" />
      <span className="metaLine" />
    </RelatedSkeletonItem>
  ))

const getRelatedPostMeta = (post: TPost) => {
  const taxonomy = post.tags?.[0] || post.category?.[0] || post.type?.[0] || "Post"
  return `${taxonomy} · ${formatDate(post.date?.start_date || post.createdTime)}`
}

export const RelatedPostsSection = ({
  showRelatedTagSkeleton,
  relatedByTagPosts,
  showRelatedAuthorSkeleton,
  relatedByAuthorPosts,
}: RelatedPostsSectionProps) => {
  const relatedPosts = [...relatedByTagPosts, ...relatedByAuthorPosts]
    .filter((post, index, posts) => posts.findIndex((item) => item.id === post.id) === index)
    .slice(0, 2)
  const showSkeleton = relatedPosts.length === 0 && (showRelatedTagSkeleton || showRelatedAuthorSkeleton)

  if (!showSkeleton && relatedPosts.length === 0) return null

  return (
    <RelatedSection aria-label="관련 글" data-rum-section="related">
      <span className="monoLabel">Continue reading</span>
      <h3>관련 글</h3>
      <ul>
        {showSkeleton
          ? renderSkeletonItems("related")
          : relatedPosts.map((post) => (
              <li key={post.id}>
                <Link href={toCanonicalPostPath(post.id)}>
                  <span className="relatedItemCopy">
                    <strong>{post.title}</strong>
                    <span className="relatedMeta">{getRelatedPostMeta(post)}</span>
                  </span>
                  <span className="relatedArrow" aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
      </ul>
    </RelatedSection>
  )
}
