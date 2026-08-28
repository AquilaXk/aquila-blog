package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
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
    @DisplayName("enabled feature store reuses the retained local snapshot")
    fun enabledFeatureStoreReusesLocalSnapshot() {
        val repository = RecordingPostAttrRepository()
        val featureStore =
            PostRecommendFeatureStoreService(
                postAttrRepository = repository,
                objectMapper = ObjectMapper(),
                enabled = true,
                staleSeconds = 900,
                localCacheTtlSeconds = 120,
            )
        val post =
            testPost(
                id = 3L,
                createdAt = Instant.parse("2026-08-28T00:00:00Z"),
                content = "cached recommendation #kotlin",
            )

        val first = featureStore.resolveForPosts(listOf(post)).getValue(post.id)
        val second = featureStore.resolveForPosts(listOf(post)).getValue(post.id)

        assertThat(second).isEqualTo(first)
        assertThat(repository.saveCount).isEqualTo(1)
    }

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

    private class RecordingPostAttrRepository : PostAttrRepositoryPort {
        private var stored: PostAttr? = null
        var saveCount: Int = 0
            private set

        override fun findBySubjectAndName(
            subject: Post,
            name: String,
        ): PostAttr? = stored

        override fun findBySubjectInAndNameIn(
            subjects: List<Post>,
            names: List<String>,
        ): List<PostAttr> = listOfNotNull(stored)

        override fun incrementIntValue(
            subject: Post,
            name: String,
            delta: Int,
        ): Int = error("not used")

        override fun findRecentlyModifiedByName(
            name: String,
            modifiedAfter: Instant,
            limit: Int,
        ): List<PostAttr> = error("not used")

        override fun save(attr: PostAttr): PostAttr {
            stored = attr
            saveCount += 1
            return attr
        }
    }
}
