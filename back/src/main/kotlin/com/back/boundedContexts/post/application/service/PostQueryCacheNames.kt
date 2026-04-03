package com.back.boundedContexts.post.application.service

/**
 * `PostQueryCacheNames` 오브젝트입니다.
 * - 역할: 정적 유틸/상수/팩토리 기능을 제공합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
object PostQueryCacheNames {
    const val ADMIN_POSTS_FIRST_PAGE = "post-admin-posts-first-page-v1"
    const val FEED = "post-feed-v4"
    const val EXPLORE = "post-explore-v4"
    const val FEED_CURSOR_FIRST = "post-feed-cursor-first-v1"
    const val EXPLORE_CURSOR_FIRST = "post-explore-cursor-first-v1"
    const val BOOTSTRAP = "post-bootstrap-v1"
    const val SEARCH = "post-search-v1"
    const val SEARCH_NEGATIVE = "post-search-negative-v1"
    const val TAGS = "post-tags-v4"
    const val DETAIL_PUBLIC_SNAPSHOT = "post-detail-public-snapshot-v1"
    const val DETAIL_PUBLIC_META = "post-detail-public-meta-v1"
    const val DETAIL_PUBLIC_CONTENT = "post-detail-public-content-v1"
    const val DETAIL_PUBLIC_NEGATIVE = "post-detail-public-negative-v1"
}
