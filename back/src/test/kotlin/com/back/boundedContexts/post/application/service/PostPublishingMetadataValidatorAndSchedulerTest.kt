package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.post.adapter.scheduler.PostScheduledPublishScheduledJob
import com.back.boundedContexts.post.adapter.web.PostPublicReadEtagSeedBuilder
import com.back.boundedContexts.post.adapter.web.PostWriteResultDto
import com.back.boundedContexts.post.application.port.input.PostScheduledPublishUseCase
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRevisionRepositoryPort
import com.back.boundedContexts.post.dto.PublicPostSeriesResBody
import com.back.boundedContexts.post.dto.PublicSeriesPostItemDto
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.boundedContexts.post.model.Post
import com.back.boundedContexts.post.model.PostSummarySource
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.application.UploadedFileUrlCodec
import com.back.global.task.application.TaskFacade
import com.back.standard.util.Ut
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.ArgumentMatchers.eq
import org.mockito.Mockito.mock
import org.mockito.Mockito.mockingDetails
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.cache.Cache
import org.springframework.cache.CacheManager
import org.springframework.cache.concurrent.ConcurrentMapCacheManager
import org.springframework.test.util.ReflectionTestUtils
import org.springframework.transaction.support.TransactionSynchronizationManager
import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Optional

@DisplayName("출판 메타데이터 검증 및 예약 발행 스케줄러 단위 테스트")
class PostPublishingMetadataValidatorAndSchedulerTest {
    companion object {
        @JvmStatic
        @BeforeAll
        fun initAppConfig() {
            Ut.JSON.objectMapper = jacksonObjectMapper()
            AppConfig(
                siteBackUrl = "https://api.example.com",
                siteFrontUrl = "https://example.com",
            )
        }
    }

    private val fixedNow: Instant = Instant.parse("2026-11-27T12:00:00Z")
    private val fixedClock: Clock = Clock.fixed(fixedNow, ZoneOffset.UTC)

    @AfterEach
    fun cleanupTransactionSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization()
        }
    }

    @Test
    fun `시리즈명과 순번 정규화는 공백을 정리하고 상한 및 음수를 Fail-Closed 거부한다`() {
        assertThat(PostPublishingMetadataValidator.normalizeSeriesName(null)).isNull()
        assertThat(PostPublishingMetadataValidator.normalizeSeriesName("   \t  ")).isNull()
        assertThat(PostPublishingMetadataValidator.normalizeSeriesName("  Kotlin   Deep\nDive  "))
            .isEqualTo("Kotlin Deep Dive")

        val tooLongSeries = "a".repeat(PostPublishingMetadataValidator.MAX_SERIES_NAME_LENGTH + 1)
        assertThatThrownBy { PostPublishingMetadataValidator.normalizeSeriesName(tooLongSeries) }
            .isInstanceOf(AppException::class.java)
            .extracting { (it as AppException).errorCode }
            .isEqualTo(ErrorCode.BAD_REQUEST)

        assertThat(PostPublishingMetadataValidator.normalizeSeriesOrder(3, null)).isNull()
        assertThat(PostPublishingMetadataValidator.normalizeSeriesOrder(null, "Kotlin Deep Dive")).isNull()
        assertThat(PostPublishingMetadataValidator.normalizeSeriesOrder(2, "Kotlin Deep Dive")).isEqualTo(2)

        assertThatThrownBy { PostPublishingMetadataValidator.normalizeSeriesOrder(0, "Kotlin Deep Dive") }
            .isInstanceOf(AppException::class.java)
    }

    @Test
    fun `정본 URL 검증은 위험 스킴, 제어 문자, 사용자정보, 길이 초과를 Fail-Closed 거부한다`() {
        assertThat(PostPublishingMetadataValidator.normalizeCanonicalUrl(null)).isNull()
        assertThat(PostPublishingMetadataValidator.normalizeCanonicalUrl("  ")).isNull()
        assertThat(PostPublishingMetadataValidator.normalizeCanonicalUrl("https://origin.example.com/posts/hello?ref=rss"))
            .isEqualTo("https://origin.example.com/posts/hello?ref=rss")
        assertThat(PostPublishingMetadataValidator.normalizeCanonicalUrl("http://origin.example.com/a"))
            .isEqualTo("http://origin.example.com/a")
        assertThat(PostPublishingMetadataValidator.normalizeCanonicalUrl("https://example.com/@author/post"))
            .isEqualTo("https://example.com/@author/post")

        val tooLongUrl = "https://example.com/" + "a".repeat(PostPublishingMetadataValidator.MAX_CANONICAL_URL_LENGTH)
        listOf(
            tooLongUrl,
            "https://example.com/bad\npath",
            "https://example.com/bad path",
            "https://example.com/bad\u007fpath",
            "https://[broken-uri",
            "javascript:alert(1)",
            "ftp://example.com/file",
            "https://user:pass@example.com/post",
            "https://@example.com/post",
            "https:///missing-host",
            "/posts/local",
            "//protocol-relative.example.com/posts/1",
        ).forEach { invalidUrl ->
            assertThatThrownBy { PostPublishingMetadataValidator.normalizeCanonicalUrl(invalidUrl) }
                .describedAs("invalidUrl=%s", invalidUrl)
                .isInstanceOf(AppException::class.java)
        }
    }

    @Test
    fun `예약 발행 시각 검증은 즉시 발행 충돌과 과거 시각을 거부하고 기존 예약 유지는 허용한다`() {
        val futureAt = fixedNow.plusSeconds(600)
        val pastAt = fixedNow.minusSeconds(120)

        assertThatThrownBy {
            PostPublishingMetadataValidator.normalizeSchedule(
                published = true,
                requestedScheduledAt = futureAt,
                existingScheduledAt = null,
                now = fixedNow,
            )
        }.isInstanceOf(AppException::class.java)

        assertThat(
            PostPublishingMetadataValidator.normalizeSchedule(
                published = true,
                requestedScheduledAt = null,
                existingScheduledAt = futureAt,
                now = fixedNow,
            ),
        ).isNull()

        assertThat(
            PostPublishingMetadataValidator.normalizeSchedule(
                published = false,
                requestedScheduledAt = null,
                existingScheduledAt = futureAt,
                now = fixedNow,
            ),
        ).isNull()

        assertThatThrownBy {
            PostPublishingMetadataValidator.normalizeSchedule(
                published = false,
                requestedScheduledAt = pastAt,
                existingScheduledAt = null,
                now = fixedNow,
            )
        }.isInstanceOf(AppException::class.java)

        assertThat(
            PostPublishingMetadataValidator.normalizeSchedule(
                published = false,
                requestedScheduledAt = pastAt,
                existingScheduledAt = pastAt,
                now = fixedNow,
            ),
        ).isEqualTo(pastAt)

        val normalized =
            PostPublishingMetadataValidator.normalizeAll(
                published = false,
                scheduledAt = futureAt,
                existingScheduledAt = null,
                seriesName = "  Spring   Boot ",
                seriesOrder = 4,
                canonicalUrl = "https://external.example.com/spring-4",
                now = fixedNow,
            )
        assertThat(normalized.scheduledAt).isEqualTo(futureAt)
        assertThat(normalized.seriesName).isEqualTo("Spring Boot")
        assertThat(normalized.seriesOrder).isEqualTo(4)
        assertThat(normalized.canonicalUrl).isEqualTo("https://external.example.com/spring-4")

        assertThat(
            PostPublishingMetadataValidator.normalizeSchedule(
                published = false,
                requestedScheduledAt = futureAt,
                now = fixedNow,
            ),
        ).isEqualTo(futureAt)

        val defaultExistingNormalized =
            PostPublishingMetadataValidator.normalizeAll(
                published = false,
                scheduledAt = futureAt,
                seriesName = "Spring Boot",
                seriesOrder = 1,
                canonicalUrl = null,
                now = fixedNow,
            )
        assertThat(defaultExistingNormalized.scheduledAt).isEqualTo(futureAt)
        assertThat(defaultExistingNormalized.seriesName).isEqualTo("Spring Boot")
        assertThat(defaultExistingNormalized.seriesOrder).isEqualTo(1)
        assertThat(defaultExistingNormalized.canonicalUrl).isNull()
    }

    @Test
    fun `예약 발행 실행기는 미도래·삭제·기발행·존재하지 않는 글을 건너뛴다`() {
        val postRepository = mock(PostRepositoryPort::class.java)
        val postTempDraftService = mock(PostTempDraftService::class.java)
        val executor =
            PostScheduledPublishExecutor(
                postRepository = postRepository,
                postTempDraftService = postTempDraftService,
                postTagIndexService = mock(PostTagIndexService::class.java),
                postHydrationService = mock(PostHydrationService::class.java),
                taskFacade = mock(TaskFacade::class.java),
                objectMapper = jacksonObjectMapper(),
            )
        val author = buildMember(1L)

        `when`(postRepository.findByIdForUpdate(10L)).thenReturn(Optional.empty())
        assertThat(executor.publishDuePost(10L, fixedNow)).isFalse()

        val noSchedule = buildPost(11L, author, scheduledAt = null)
        `when`(postRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(noSchedule))
        assertThat(executor.publishDuePost(11L, fixedNow)).isFalse()

        val deletedPost = buildPost(12L, author, scheduledAt = fixedNow.minusSeconds(10)).apply { deletedAt = fixedNow }
        `when`(postRepository.findByIdForUpdate(12L)).thenReturn(Optional.of(deletedPost))
        assertThat(executor.publishDuePost(12L, fixedNow)).isFalse()

        val alreadyPublished = buildPost(13L, author, published = true, scheduledAt = fixedNow.minusSeconds(10))
        `when`(postRepository.findByIdForUpdate(13L)).thenReturn(Optional.of(alreadyPublished))
        assertThat(executor.publishDuePost(13L, fixedNow)).isFalse()

        val futureSchedule = buildPost(14L, author, scheduledAt = fixedNow.plusSeconds(60))
        `when`(postRepository.findByIdForUpdate(14L)).thenReturn(Optional.of(futureSchedule))
        assertThat(executor.publishDuePost(14L, fixedNow)).isFalse()

        val tempDraftPost =
            buildPost(
                15L,
                author,
                published = false,
                listed = false,
                isTempDraft = true,
                scheduledAt = fixedNow.minusSeconds(10),
            )
        `when`(postRepository.findByIdForUpdate(15L)).thenReturn(Optional.of(tempDraftPost))
        `when`(postTempDraftService.isTempDraft(tempDraftPost)).thenReturn(true)
        assertThat(executor.publishDuePost(15L, fixedNow)).isFalse()
        assertThat(tempDraftPost.published).isFalse()
        assertThat(tempDraftPost.isTempDraft).isTrue()
    }

    @Test
    fun `예약 발행 실행기는 기한 도래 글을 발행하고 트랜잭션 커밋 후 캐시 무효화와 리비전을 처리한다`() {
        val postRepository = mock(PostRepositoryPort::class.java)
        val postTempDraftService = mock(PostTempDraftService::class.java)
        val postTagIndexService = mock(PostTagIndexService::class.java)
        val postHydrationService = mock(PostHydrationService::class.java)
        val taskFacade = mock(TaskFacade::class.java)
        val failingCacheManager = mock(CacheManager::class.java)
        val failingInvalidator = PostReadCacheInvalidator(failingCacheManager)
        val revisionRepository = mock(PostRevisionRepositoryPort::class.java)
        val objectMapper: ObjectMapper = jacksonObjectMapper()

        val executor =
            PostScheduledPublishExecutor(
                postRepository = postRepository,
                postTempDraftService = postTempDraftService,
                postTagIndexService = postTagIndexService,
                postHydrationService = postHydrationService,
                taskFacade = taskFacade,
                objectMapper = objectMapper,
                postReadCacheInvalidator = failingInvalidator,
                postRevisionRepository = revisionRepository,
            )

        val author = buildMember(7L)
        val dueScheduledPost =
            buildPost(
                id = 21L,
                author = author,
                published = false,
                listed = true,
                isTempDraft = false,
                scheduledAt = fixedNow.minusSeconds(5),
            )
        `when`(postRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(dueScheduledPost))
        `when`(postTempDraftService.isTempDraft(dueScheduledPost)).thenReturn(false)
        `when`(postTagIndexService.syncPostTags(dueScheduledPost)).thenReturn(listOf("kotlin"))

        TransactionSynchronizationManager.initSynchronization()
        val result = executor.publishDuePost(21L, fixedNow)
        assertThat(result).isTrue()
        assertThat(dueScheduledPost.published).isTrue()
        assertThat(dueScheduledPost.listed).isTrue()
        assertThat(dueScheduledPost.isTempDraft).isFalse()
        assertThat(dueScheduledPost.scheduledAt).isNull()
        verify(postRepository).findByIdForUpdate(21L)
        verify(postTempDraftService, never()).clearTrackedTempDraftIfMatches(author, 21L)
        val expectedKeys =
            UploadedFileUrlCodec
                .extractPartitionedObjectKeysFromContent(dueScheduledPost.content)
                .allKeys()
        verify(postRepository).syncImageReferences(21L, expectedKeys)
        verify(revisionRepository).appendAndTrimRevisions(
            postId = 21L,
            authorId = 7L,
            title = dueScheduledPost.title,
            content = dueScheduledPost.content,
            summaryText = dueScheduledPost.summaryText,
            maxRevisionsPerPost = 20,
        )
        verify(failingCacheManager, never()).getCache(anyString())

        val queuedAfterFirst =
            mockingDetails(taskFacade)
                .invocations
                .filter { it.method.name == "addToQueue" }
                .map { it.getArgument<PostWriteSideEffectPayload>(0) }
        assertThat(queuedAfterFirst).hasSize(1)
        val listedPayload = queuedAfterFirst.first()
        assertThat(listedPayload.beforeTags).isEmpty()
        assertThat(listedPayload.afterTags).containsExactly("kotlin")
        assertThat(listedPayload.recommendationAction).isEqualTo(PostRecommendationSideEffect.REFRESH)
        assertThat(listedPayload.cacheInvalidationTargets)
            .isEqualTo(PostReadCacheInvalidationScope.PublicPostCreated.targets())
        val listedEvent = objectMapper.readValue(listedPayload.domainEventJson!!, PostWrittenEvent::class.java)
        assertThat(listedEvent.beforeTags).isEmpty()
        assertThat(listedEvent.afterTags).containsExactly("kotlin")

        val syncs = TransactionSynchronizationManager.getSynchronizations()
        assertThat(syncs).hasSize(1)
        `when`(failingCacheManager.getCache(anyString())).thenThrow(RuntimeException("cache down"))
        syncs.first().afterCommit()
        TransactionSynchronizationManager.clearSynchronization()

        // 비목록(unlisted) 예약 글은 공개 피드·태그 캐시를 비우지 않고 추천 스토어 EVICT로 격리한다
        val workingCacheManager =
            ConcurrentMapCacheManager(
                PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE,
                PostQueryCacheNames.ADMIN_POSTS_FIRST_PAGE,
                PostQueryCacheNames.FEED,
                PostQueryCacheNames.EXPLORE,
                PostQueryCacheNames.TAGS,
            )
        val negativeCache: Cache = workingCacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE)!!
        val adminFirstPageCache: Cache = workingCacheManager.getCache(PostQueryCacheNames.ADMIN_POSTS_FIRST_PAGE)!!
        val feedCache: Cache = workingCacheManager.getCache(PostQueryCacheNames.FEED)!!
        val exploreCache: Cache = workingCacheManager.getCache(PostQueryCacheNames.EXPLORE)!!
        val tagsCache: Cache = workingCacheManager.getCache(PostQueryCacheNames.TAGS)!!
        negativeCache.put(22L, true)
        adminFirstPageCache.put("page-1", "cached")
        feedCache.put("page-1", "cached-feed")
        exploreCache.put("page-1", "cached-explore")
        tagsCache.put("public", "cached-tags")
        val workingExecutor =
            PostScheduledPublishExecutor(
                postRepository = postRepository,
                postTempDraftService = postTempDraftService,
                postTagIndexService = postTagIndexService,
                postHydrationService = postHydrationService,
                taskFacade = taskFacade,
                objectMapper = objectMapper,
                postReadCacheInvalidator = PostReadCacheInvalidator(workingCacheManager),
                postRevisionRepository = revisionRepository,
            )
        val unlistedScheduled =
            buildPost(
                id = 22L,
                author = author,
                published = false,
                listed = false,
                isTempDraft = false,
                scheduledAt = fixedNow.minusSeconds(5),
            )
        `when`(postRepository.findByIdForUpdate(22L)).thenReturn(Optional.of(unlistedScheduled))
        `when`(postTempDraftService.isTempDraft(unlistedScheduled)).thenReturn(false)
        `when`(postTagIndexService.syncPostTags(unlistedScheduled)).thenReturn(listOf("unlisted"))

        assertThat(workingExecutor.publishDuePost(22L, fixedNow)).isTrue()
        assertThat(unlistedScheduled.published).isTrue()
        assertThat(unlistedScheduled.listed).isFalse()
        assertThat(negativeCache.get(22L)).isNull()
        assertThat(adminFirstPageCache.get("page-1")).isNull()
        assertThat(feedCache.get("page-1")?.get()).isEqualTo("cached-feed")
        assertThat(exploreCache.get("page-1")?.get()).isEqualTo("cached-explore")
        assertThat(tagsCache.get("public")?.get()).isEqualTo("cached-tags")
        verify(postRepository).findByIdForUpdate(22L)
        verify(postTempDraftService, never()).clearTrackedTempDraftIfMatches(author, 22L)

        val allQueuedPayloads =
            mockingDetails(taskFacade)
                .invocations
                .filter { it.method.name == "addToQueue" }
                .map { it.getArgument<PostWriteSideEffectPayload>(0) }
        assertThat(allQueuedPayloads).hasSize(2)
        val unlistedPayload = allQueuedPayloads.last()
        assertThat(unlistedPayload.beforeTags).isEmpty()
        assertThat(unlistedPayload.afterTags).containsExactly("unlisted")
        assertThat(unlistedPayload.recommendationAction).isEqualTo(PostRecommendationSideEffect.EVICT)
        assertThat(unlistedPayload.cacheInvalidationTargets)
            .isEqualTo(PostReadCacheInvalidationScope.AdminPostListAndDetail.targets())
        val unlistedEvent = objectMapper.readValue(unlistedPayload.domainEventJson!!, PostWrittenEvent::class.java)
        assertThat(unlistedEvent.beforeTags).isEmpty()
        assertThat(unlistedEvent.afterTags).containsExactly("unlisted")
    }

    @Test
    fun `예약 발행 서비스와 잡은 개별 오류를 격리해 처리 건수를 반환한다`() {
        val postRepository = mock(PostRepositoryPort::class.java)
        val executor = mock(PostScheduledPublishExecutor::class.java)
        val service = PostScheduledPublishService(postRepository, executor, fixedClock)

        `when`(postRepository.findDueScheduledDraftIds(fixedNow, 100)).thenReturn(listOf(1L, 2L, 3L))
        `when`(executor.publishDuePost(1L, fixedNow)).thenReturn(true)
        `when`(executor.publishDuePost(2L, fixedNow)).thenThrow(IllegalStateException("db timeout"))
        `when`(executor.publishDuePost(3L, fixedNow)).thenReturn(false)

        val published = service.publishDueScheduledPosts(now = null, batchSize = 500)
        assertThat(published).isEqualTo(1)

        val explicitPublished = service.publishDueScheduledPosts(now = fixedNow, batchSize = 500)
        assertThat(explicitPublished).isEqualTo(1)

        val jobUseCase = mock(PostScheduledPublishUseCase::class.java)
        val job = PostScheduledPublishScheduledJob(jobUseCase, 50)
        `when`(jobUseCase.publishDueScheduledPosts(now = null, batchSize = 50)).thenReturn(0).thenReturn(2)
        job.publishDuePosts()
        job.publishDuePosts()
        verify(jobUseCase, org.mockito.Mockito.times(2)).publishDueScheduledPosts(now = null, batchSize = 50)

        val defaultClockService = PostScheduledPublishService(postRepository, executor)
        `when`(postRepository.findDueScheduledDraftIds(any(Instant::class.java) ?: fixedNow, eq(10)))
            .thenReturn(emptyList())
        assertThat(defaultClockService.publishDueScheduledPosts(now = null, batchSize = 10)).isZero()
    }

    @Test
    fun `예약 발행 실행기는 선택적 의존성 없이도 동작하고 결과 DTO와 시리즈 ETag 기본값을 검증한다`() {
        val postRepository = mock(PostRepositoryPort::class.java)
        val postTempDraftService = mock(PostTempDraftService::class.java)
        val postTagIndexService = mock(PostTagIndexService::class.java)
        val postHydrationService = mock(PostHydrationService::class.java)
        val taskFacade = mock(TaskFacade::class.java)
        val executorWithoutOptional =
            PostScheduledPublishExecutor(
                postRepository = postRepository,
                postTempDraftService = postTempDraftService,
                postTagIndexService = postTagIndexService,
                postHydrationService = postHydrationService,
                taskFacade = taskFacade,
                objectMapper = jacksonObjectMapper(),
            )
        val author = buildMember(9L)
        val post =
            buildPost(
                id = 31L,
                author = author,
                published = false,
                listed = true,
                isTempDraft = false,
                scheduledAt = fixedNow.minusSeconds(1),
            )
        `when`(postRepository.findByIdForUpdate(31L)).thenReturn(Optional.of(post))
        `when`(postTempDraftService.isTempDraft(post)).thenReturn(false)
        `when`(postTagIndexService.syncPostTags(post)).thenReturn(emptyList())

        assertThat(executorWithoutOptional.publishDuePost(31L, fixedNow)).isTrue()

        val failingCacheManager = mock(CacheManager::class.java)
        `when`(failingCacheManager.getCache(anyString())).thenThrow(RuntimeException("cache offline"))
        val nonTxExecutor =
            PostScheduledPublishExecutor(
                postRepository = postRepository,
                postTempDraftService = postTempDraftService,
                postTagIndexService = postTagIndexService,
                postHydrationService = postHydrationService,
                taskFacade = taskFacade,
                objectMapper = jacksonObjectMapper(),
                postReadCacheInvalidator = PostReadCacheInvalidator(failingCacheManager),
            )
        val secondPost =
            buildPost(
                id = 32L,
                author = author,
                published = false,
                listed = true,
                isTempDraft = false,
                scheduledAt = fixedNow.minusSeconds(1),
            )
        `when`(postRepository.findByIdForUpdate(32L)).thenReturn(Optional.of(secondPost))
        `when`(postTempDraftService.isTempDraft(secondPost)).thenReturn(false)
        `when`(postTagIndexService.syncPostTags(secondPost)).thenReturn(emptyList())

        assertThat(nonTxExecutor.publishDuePost(32L, fixedNow)).isTrue()

        val defaultResultDto =
            PostWriteResultDto(
                id = 31L,
                title = "기본 메타 DTO",
                version = 0L,
                published = true,
                listed = true,
                summary = "",
                summarySource = PostSummarySource.NONE,
            )
        assertThat(defaultResultDto.scheduledAt).isNull()
        assertThat(defaultResultDto.seriesName).isNull()
        assertThat(defaultResultDto.seriesOrder).isNull()
        assertThat(defaultResultDto.canonicalUrl).isNull()

        val seedBuilder = PostPublicReadEtagSeedBuilder()
        val emptySeriesEtag = seedBuilder.buildSeriesWeakEtag(1L, PublicPostSeriesResBody(null, emptyList()))
        val unorderedItemSeriesEtag =
            seedBuilder.buildSeriesWeakEtag(
                1L,
                PublicPostSeriesResBody(
                    seriesName = "Series",
                    items =
                        listOf(
                            PublicSeriesPostItemDto(
                                id = 1L,
                                title = "첫 글",
                                seriesOrder = null,
                                createdAt = fixedNow,
                            ),
                        ),
                ),
            )
        assertThat(emptySeriesEtag).startsWith("W/\"").isNotEqualTo(unorderedItemSeriesEtag)
    }

    private fun buildMember(id: Long): Member =
        Member(
            id = id,
            username = "admin@test.com",
            password = "",
            nickname = "관리자",
            email = "admin@test.com",
            admin = true,
        ).apply {
            createdAt = fixedNow.minusSeconds(7200)
            modifiedAt = fixedNow.minusSeconds(3600)
            setProfileWorkspacePublishedContent(MemberProfileWorkspaceContent())
        }

    private fun buildPost(
        id: Long,
        author: Member,
        published: Boolean = false,
        listed: Boolean = true,
        isTempDraft: Boolean = false,
        scheduledAt: Instant? = null,
    ): Post =
        Post(
            author = author,
            title = "예약 테스트 $id",
            content = "본문 $id",
            published = published,
            listed = listed,
            isTempDraft = isTempDraft,
            scheduledAt = scheduledAt,
        ).apply {
            ReflectionTestUtils.setField(this, "id", id)
            this.createdAt = fixedNow.minusSeconds(3600)
            this.modifiedAt = fixedNow.minusSeconds(1800)
        }
}
