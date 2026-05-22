import Link from "next/link"
import { formatDate } from "src/libs/utils"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import { normalizeCardSummary } from "src/libs/postSummary"
import type { TPost } from "src/types"
import { RelatedSection, RelatedSkeletonItem } from "./PostDetail.styles"

const RELATED_SKELETON_COUNT = 3

type RelatedPostsSectionProps = {
  relatedTag: string
  showRelatedTagSkeleton: boolean
  relatedByTagPosts: TPost[]
  showRelatedAuthorSkeleton: boolean
  relatedByAuthorPosts: TPost[]
}

const renderRelatedSummary = (summary: string | undefined) => {
  const summaryText = normalizeCardSummary(summary, { fallback: "", maxLength: 148 })
  return summaryText ? <p>{summaryText}</p> : null
}

const renderSkeletonItems = (prefix: string) =>
  Array.from({ length: RELATED_SKELETON_COUNT }, (_, index) => (
    <RelatedSkeletonItem key={`${prefix}-skeleton-${index}`} aria-hidden="true">
      <span className="titleLine" />
      <span className="summaryLine wide" />
      <span className="summaryLine medium" />
      <span className="metaLine" />
    </RelatedSkeletonItem>
  ))

export const RelatedPostsSection = ({
  relatedTag,
  showRelatedTagSkeleton,
  relatedByTagPosts,
  showRelatedAuthorSkeleton,
  relatedByAuthorPosts,
}: RelatedPostsSectionProps) => (
  <>
    {(showRelatedTagSkeleton || relatedByTagPosts.length > 0) && (
      <RelatedSection aria-label="연관 글" data-rum-section="related-tag">
        <header>
          <div className="headerCopy">
            <h2>같은 태그 글</h2>
            <p className="sectionReason">현재 글과 같은 태그 흐름에서 바로 이어 읽기 좋은 글만 추렸습니다.</p>
          </div>
          <Link href={relatedTag ? `/?tag=${encodeURIComponent(relatedTag)}` : "/"}>태그 글 보기</Link>
        </header>
        <ul>
          {showRelatedTagSkeleton
            ? renderSkeletonItems("tag")
            : relatedByTagPosts.map((post) => (
                <li key={post.id}>
                  <Link href={toCanonicalPostPath(post.id)}>
                    <span className="reasonChip">같은 태그</span>
                    <strong>{post.title}</strong>
                    {renderRelatedSummary(post.summary)}
                    <span>{formatDate(post.date?.start_date || post.createdTime)}</span>
                  </Link>
                </li>
              ))}
        </ul>
      </RelatedSection>
    )}

    {(showRelatedAuthorSkeleton || relatedByAuthorPosts.length > 0) && (
      <RelatedSection aria-label="같은 작성자 글" data-rum-section="related-author">
        <header>
          <div className="headerCopy">
            <h2>같은 작성자 글</h2>
            <p className="sectionReason">같은 문제의식과 톤으로 연결되는 작성자 글을 한 번에 이어볼 수 있습니다.</p>
          </div>
          <Link href="/">작성자 글 보기</Link>
        </header>
        <ul>
          {showRelatedAuthorSkeleton
            ? renderSkeletonItems("author")
            : relatedByAuthorPosts.map((post) => (
                <li key={post.id}>
                  <Link href={toCanonicalPostPath(post.id)}>
                    <span className="reasonChip">같은 작성자</span>
                    <strong>{post.title}</strong>
                    {renderRelatedSummary(post.summary)}
                    <span>{formatDate(post.date?.start_date || post.createdTime)}</span>
                  </Link>
                </li>
              ))}
        </ul>
      </RelatedSection>
    )}
  </>
)
