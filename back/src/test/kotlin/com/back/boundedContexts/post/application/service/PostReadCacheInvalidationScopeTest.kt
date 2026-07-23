package com.back.boundedContexts.post.application.service

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("PostReadCacheInvalidationScope 테스트")
class PostReadCacheInvalidationScopeTest {
    @Test
    @DisplayName("공개 글 생성 삭제 복구 영구삭제는 전체 공개 읽기 캐시를 축출한다")
    fun publicPostLifecycleScopesEvictAllPublicReadTargets() {
        val scopes =
            listOf(
                PostReadCacheInvalidationScope.PublicPostCreated,
                PostReadCacheInvalidationScope.PublicPostDeleted,
                PostReadCacheInvalidationScope.PublicPostRestored,
                PostReadCacheInvalidationScope.PublicPostHardDeleted,
            )

        scopes.forEach { scope ->
            assertThat(evictedTargets(scope)).containsExactlyInAnyOrderElementsOf(PostReadCacheInvalidationTarget.entries)
        }
    }

    @Test
    @DisplayName("공개 글 수정은 변경 영향에 따라 검색 태그 상세 캐시 범위를 분리한다")
    fun publicPostModifiedScopeSeparatesImpactedTargets() {
        val noVisibleChange = PostReadCacheInvalidationScope.PublicPostModified(emptySet())
        val titleChange =
            PostReadCacheInvalidationScope.PublicPostModified(
                setOf(PostPublicChangeImpact.TITLE),
            )
        val tagChange =
            PostReadCacheInvalidationScope.PublicPostModified(
                setOf(PostPublicChangeImpact.TAG),
            )
        val visibilityChange =
            PostReadCacheInvalidationScope.PublicPostModified(
                setOf(PostPublicChangeImpact.LISTING_VISIBILITY),
            )

        assertThat(evictedTargets(noVisibleChange))
            .containsExactly(PostReadCacheInvalidationTarget.HOT_READ_PAGES)
        assertThat(evictedTargets(titleChange))
            .containsExactlyInAnyOrder(
                PostReadCacheInvalidationTarget.HOT_READ_PAGES,
                PostReadCacheInvalidationTarget.SEARCH_FIRST_PAGE,
                PostReadCacheInvalidationTarget.DETAIL,
            )
        assertThat(evictedTargets(tagChange))
            .containsExactlyInAnyOrder(
                PostReadCacheInvalidationTarget.HOT_READ_PAGES,
                PostReadCacheInvalidationTarget.SEARCH_FIRST_PAGE,
                PostReadCacheInvalidationTarget.IMPACTED_TAG_PAGES,
                PostReadCacheInvalidationTarget.PUBLIC_TAGS,
            )
        assertThat(evictedTargets(visibilityChange))
            .containsExactlyInAnyOrderElementsOf(PostReadCacheInvalidationTarget.entries)
    }

    @Test
    @DisplayName("비공개 변경과 상세 전용 축출은 공개 읽기 캐시 범위를 넓히지 않는다")
    fun nonPublicAndDetailOnlyScopesKeepTargetsNarrow() {
        assertThat(evictedTargets(PostReadCacheInvalidationScope.None)).isEmpty()
        assertThat(evictedTargets(PostReadCacheInvalidationScope.DetailOnly))
            .containsExactly(PostReadCacheInvalidationTarget.DETAIL)
    }

    private fun evictedTargets(scope: PostReadCacheInvalidationScope): List<PostReadCacheInvalidationTarget> =
        PostReadCacheInvalidationTarget.entries.filter(scope::evicts)
}
