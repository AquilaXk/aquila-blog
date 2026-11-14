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
import java.time.Clock
import java.time.Instant
import java.time.ZoneId

@DisplayName("PostRecommendRankingService 테스트")
class PostRecommendRankingServiceTest {
    @Test
    @DisplayName("enabled feature store reads without DB writes and persists only on refresh")
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
        assertThat(repository.saveCount).isEqualTo(0)
        assertThat(repository.findBatchCount).isEqualTo(1)

        featureStore.refresh(post)
        assertThat(repository.saveCount).isEqualTo(1)
    }

    @Test
    @DisplayName("version or modifiedAt change invalidates snapshot even with identical content")
    fun persistedSnapshotInvalidatedWhenPostVersionOrModifiedAtChanges() {
        val repository = RecordingPostAttrRepository()
        val objectMapper = ObjectMapper()
        val t1 = Instant.parse("2026-08-28T01:00:00Z")
        val post =
            testPost(
                id = 11L,
                createdAt = t1,
                content = "tags: [fresh]\n\nunchanged body",
            ).apply {
                version = 1L
                modifiedAt = t1
            }

        val staleJson =
            objectMapper.writeValueAsString(
                mapOf(
                    "version" to 3,
                    "postVersion" to 1L,
                    "modifiedAtEpochMs" to t1.toEpochMilli(),
                    "hitCount" to 0,
                    "likesCount" to 0,
                    "contentLength" to post.content.length,
                    "contentHash" to post.content.hashCode(),
                    "dwellProxySeconds" to 25.0,
                    "normalizedTags" to listOf("cached-v1"),
                    "capturedAtEpochMs" to System.currentTimeMillis(),
                ),
            )
        repository.save(PostAttr(1L, post, "recommendFeatureStoreV1", staleJson))

        val storeReadingSaved =
            PostRecommendFeatureStoreService(
                postAttrRepository = repository,
                objectMapper = objectMapper,
                enabled = true,
                staleSeconds = 900,
                localCacheTtlSeconds = 120,
            )
        val fromPersisted = storeReadingSaved.resolveForPosts(listOf(post)).getValue(post.id)
        assertThat(fromPersisted.normalizedTags).containsExactly("cached-v1")

        post.version = 2L
        val afterVersionChange = storeReadingSaved.resolveForPosts(listOf(post)).getValue(post.id)
        assertThat(afterVersionChange.normalizedTags).containsExactly("fresh")

        post.version = 1L
        post.modifiedAt = t1.plusSeconds(10)
        val storeAfterModifiedAtChange =
            PostRecommendFeatureStoreService(
                postAttrRepository = repository,
                objectMapper = objectMapper,
                enabled = true,
                staleSeconds = 900,
                localCacheTtlSeconds = 120,
            )
        val afterModifiedChange = storeAfterModifiedAtChange.resolveForPosts(listOf(post)).getValue(post.id)
        assertThat(afterModifiedChange.normalizedTags).containsExactly("fresh")
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
        assertThat(rankingService.resolveCandidatePoolSize(17) % 17).isEqualTo(0)
        assertThat(rankingService.isEnabledForPage(5, 10)).isTrue()
        assertThat(rankingService.isEnabledForPage(6, 10)).isTrue()
        assertThat(rankingService.isEnabledForPage(7, 10)).isFalse()
    }

    @Test
    @DisplayName("localCache는 2048 상한 초과 시 만료·가장 오래된 항목만 정리하고 clear 스탬피드를 피한다")
    fun localCacheBoundsTo2048AndEvictsExpiredThenOldestEntries() {
        val repository = RecordingPostAttrRepository()
        val featureStore =
            PostRecommendFeatureStoreService(
                postAttrRepository = repository,
                objectMapper = ObjectMapper(),
                enabled = true,
                staleSeconds = 900,
                localCacheTtlSeconds = 5,
            )
        var currentNow = Instant.parse("2026-08-28T00:00:00Z")
        featureStore.clock =
            object : Clock() {
                override fun getZone(): ZoneId = ZoneId.of("UTC")

                override fun withZone(zone: ZoneId): Clock = this

                override fun instant(): Instant = currentNow
            }

        val baseTime = Instant.parse("2026-08-28T00:00:00Z")
        val earlyPosts =
            (1L..1_000L).map { id ->
                testPost(id = id, createdAt = baseTime, content = "early-$id #kotlin")
            }
        featureStore.resolveForPosts(earlyPosts)
        assertThat(featureStore.localCacheSize()).isEqualTo(1_000)

        // 6초 후(TTL 5초 초과): earlyPosts가 만료된 상태에서 1050개 추가 -> 만료 엔트리만 정리됨
        currentNow = currentNow.plusSeconds(6)
        val activeBatchOne =
            (1_001L..2_050L).map { id ->
                testPost(id = id, createdAt = baseTime, content = "active-$id #spring")
            }
        featureStore.resolveForPosts(listOf(activeBatchOne.first()))
        currentNow = currentNow.plusSeconds(1)
        featureStore.resolveForPosts(activeBatchOne.drop(1))
        assertThat(featureStore.localCacheSize()).isEqualTo(1_050)

        val beforeActiveProbeCount = repository.findBatchCount
        featureStore.resolveForPosts(listOf(activeBatchOne.last()))
        assertThat(repository.findBatchCount).isEqualTo(beforeActiveProbeCount)

        // 만료되지 않은 상태에서 999개 추가 (총 2049) -> 가장 이른 만료 엔트리 1건(activeBatchOne.first)만 퇴출
        currentNow = currentNow.plusSeconds(1)
        val activeBatchTwo =
            (2_051L..3_049L).map { id ->
                testPost(id = id, createdAt = baseTime, content = "active-$id #jpa")
            }
        featureStore.resolveForPosts(activeBatchTwo)
        assertThat(featureStore.localCacheSize()).isEqualTo(2_048)

        val beforeRecentProbeCount = repository.findBatchCount
        featureStore.resolveForPosts(listOf(activeBatchTwo.last()))
        assertThat(repository.findBatchCount).isEqualTo(beforeRecentProbeCount)

        val beforeOldestProbeCount = repository.findBatchCount
        featureStore.resolveForPosts(listOf(activeBatchOne.first()))
        assertThat(repository.findBatchCount).isEqualTo(beforeOldestProbeCount + 1)
    }

    @Test
    @DisplayName("빈 목록, 비활성 refresh, 손상된 JSON, 저장 예외, 수동 evict를 안전하게 처리한다")
    fun disabledRefreshEmptyListAndFaultResilience() {
        val disabledStore =
            PostRecommendFeatureStoreService(
                postAttrRepository = RecordingPostAttrRepository(),
                objectMapper = ObjectMapper(),
                enabled = false,
                staleSeconds = 900,
                localCacheTtlSeconds = 120,
            )
        val post =
            testPost(
                id = 99L,
                createdAt = Instant.parse("2026-08-28T00:00:00Z"),
                content = "",
            )
        assertThat(disabledStore.resolveForPosts(emptyList())).isEmpty()
        disabledStore.refresh(post)

        val failingRepo =
            RecordingPostAttrRepository().apply {
                throwOnSave = true
            }
        failingRepo.seedRawAttr(post, "{not-valid-json")
        val enabledStore =
            PostRecommendFeatureStoreService(
                postAttrRepository = failingRepo,
                objectMapper = ObjectMapper(),
                enabled = true,
                staleSeconds = 900,
                localCacheTtlSeconds = 120,
            )
        val resolved = enabledStore.resolveForPosts(listOf(post)).getValue(post.id)
        assertThat(resolved.dwellProxySeconds).isEqualTo(20.0)
        enabledStore.refresh(post)
        enabledStore.evict(post.id)
        assertThat(enabledStore.localCacheSize()).isEqualTo(0)
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
        private val storedByPostId = linkedMapOf<Long, PostAttr>()
        var saveCount: Int = 0
            private set
        var findBatchCount: Int = 0
            private set
        var throwOnSave: Boolean = false

        fun seedRawAttr(
            post: Post,
            value: String,
        ) {
            storedByPostId[post.id] = PostAttr(1L, post, "recommendFeatureStoreV1", value)
        }

        override fun findBySubjectAndName(
            subject: Post,
            name: String,
        ): PostAttr? = storedByPostId[subject.id]

        override fun findBySubjectInAndNameIn(
            subjects: List<Post>,
            names: List<String>,
        ): List<PostAttr> {
            findBatchCount += 1
            return subjects.mapNotNull { storedByPostId[it.id] }
        }

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
            if (throwOnSave) error("simulated db write error")
            storedByPostId[attr.subject.id] = attr
            saveCount += 1
            return attr
        }
    }
}
