package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.TagCountDto
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import tools.jackson.databind.ObjectMapper
import java.time.Instant

@DisplayName("PostRecommendRankingService 테스트")
class PostRecommendRankingServiceTest {
    @Test
    @DisplayName("추천 후보가 있으면 feature vector를 계산해 재정렬 결과를 반환한다")
    fun rerankNonEmptyCandidates() {
        // given
        val featureStore =
            PostRecommendFeatureStoreService(
                postAttrRepository = mock(PostAttrRepositoryPort::class.java),
                objectMapper = ObjectMapper(),
                enabled = false,
                staleSeconds = 900,
                localCacheTtlSeconds = 120,
            )
        val rankingService =
            PostRecommendRankingService(
                postRecommendFeatureStoreService = featureStore,
                enabled = true,
                candidatePoolSize = 60,
                maxRerankPages = 4,
                hotTagsLimit = 24,
            )
        val olderPost =
            testPost(
                id = 1L,
                createdAt = Instant.parse("2026-06-18T00:00:00Z"),
                content = "오래된 글 #kotlin",
            )
        val newerPost =
            testPost(
                id = 2L,
                createdAt = Instant.parse("2026-06-19T00:00:00Z"),
                content = "새 글 #spring",
            )

        // when
        val result =
            rankingService.rerank(
                candidates = listOf(olderPost, newerPost),
                tagCounts = listOf(TagCountDto("spring", 10), TagCountDto("kotlin", 4)),
                page = 1,
                pageSize = 10,
                candidateTotalElements = 2,
            )

        // then
        assertThat(result.content).hasSize(2)
        assertThat(result.content.map(Post::id)).containsExactly(newerPost.id, olderPost.id)
        assertThat(result.totalElements).isEqualTo(2)
    }

    private fun testPost(
        id: Long,
        createdAt: Instant,
        content: String,
    ): Post =
        Post(
            id = id,
            author = Member(id = 1, username = "author", nickname = "작성자", apiKey = "author-api-key"),
            title = "title-$id",
            content = content,
            published = true,
            listed = true,
        ).also {
            it.createdAt = createdAt
            it.modifiedAt = createdAt
        }
}
