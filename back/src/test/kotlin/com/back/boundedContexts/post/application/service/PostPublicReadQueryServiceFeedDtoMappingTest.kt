package com.back.boundedContexts.post.application.service

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
import com.back.boundedContexts.post.dto.PublicPostDetailMetaCacheDto
import com.back.boundedContexts.post.dto.PublicPostDetailSnapshotCacheDto
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.util.Ut
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.times
import org.mockito.Mockito.`when`
import org.slf4j.LoggerFactory
import org.springframework.cache.Cache
import org.springframework.cache.CacheManager
import org.springframework.cache.concurrent.ConcurrentMapCacheManager
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.nio.charset.StandardCharsets
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Base64
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.math.max

@DisplayName("공개 게시글 feed DTO 매핑")
class PostPublicReadQueryServiceFeedDtoMappingTest {
    companion object {
        private const val MAPPING_FAILURE_METRIC = "post.feed.dto.mapping.failure"
        private const val CURSOR_TEST_SECRET = "test-cursor-signing-secret-abcdefghijklmnopqrstuvwxyz0123456789"
        private const val CURSOR_TEST_VERSION = "2"
        private val CURSOR_TEST_CLOCK = Clock.fixed(Instant.parse("2026-08-09T12:00:00Z"), ZoneOffset.UTC)

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

    @Test
    @DisplayName("핵심 필드 매핑 실패 행은 feed 응답에서 제외하고 metric을 기록한다")
    fun excludesCoreMappingFailureRowFromFeed() {
        val postUseCase = mock(PostUseCase::class.java)
        val meterRegistry = SimpleMeterRegistry()
        val service = createService(postUseCase, meterRegistry)
        val validPost = postByAuthor(id = 10L)
        val invalidPost = postWithoutAuditTimestamps(id = 11L)
        given(postUseCase.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 10))
            .willReturn(
                PagedResult(
                    content = listOf(validPost, invalidPost),
                    page = 1,
                    pageSize = 10,
                    totalElements = 2,
                ),
            )

        val page = service.getPublicFeed(1, 10, PostSearchSortType1.CREATED_AT)

        assertThat(page.content.map { it.id }).containsExactly(10L)
        assertThat(page.pageable.totalElements).isEqualTo(2)
        assertThat(
            meterRegistry
                .get(MAPPING_FAILURE_METRIC)
                .tag("failureType", "core")
                .counter()
                .count(),
        ).isEqualTo(1.0)
    }

    @Test
    @DisplayName("cursor feed는 제외된 row가 있어도 소비한 raw boundary로 다음 cursor를 만든다")
    fun advancesCursorByConsumedRawBoundaryWhenRowIsFiltered() {
        val postUseCase = mock(PostUseCase::class.java)
        val meterRegistry = SimpleMeterRegistry()
        val service = createService(postUseCase, meterRegistry)
        val invalidBoundaryPost = postWithMissingAuthor(id = 20L)
        val nextRawPost = postByAuthor(id = 21L)
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = null,
                cursorId = null,
                limit = 3,
                sort = PostSearchSortType1.CREATED_AT,
            ),
        ).willReturn(listOf(invalidBoundaryPost, nextRawPost))
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = Instant.parse("2026-01-02T00:00:00Z").toEpochMilli(),
                cursorId = 20L,
                limit = 3,
                sort = PostSearchSortType1.CREATED_AT,
            ),
        ).willReturn(listOf(nextRawPost))

        val page = service.getPublicFeedByCursor(null, 1, PostSearchSortType1.CREATED_AT)
        val nextPage = service.getPublicFeedByCursor(page.nextCursor, 1, PostSearchSortType1.CREATED_AT)

        assertThat(page.content).isEmpty()
        assertThat(page.hasNext).isTrue()
        assertThat(page.nextCursor).isNotBlank()
        assertThat(nextPage.content.map { it.id }).containsExactly(21L)
        assertThat(nextPage.hasNext).isFalse()
        assertThat(
            meterRegistry
                .get(MAPPING_FAILURE_METRIC)
                .tag("failureType", "core")
                .counter()
                .count(),
        ).isEqualTo(1.0)
    }

    @Test
    @DisplayName("cursor feed는 boundary row의 audit timestamp가 없어도 다음 row를 숨기지 않는다")
    fun doesNotHideNextRowWhenFilteredBoundaryRowHasNoAuditTimestamp() {
        val postUseCase = mock(PostUseCase::class.java)
        val meterRegistry = SimpleMeterRegistry()
        val service = createService(postUseCase, meterRegistry)
        val invalidBoundaryPost = postWithoutAuditTimestamps(id = 22L)
        val nextRawPost = postByAuthor(id = 23L)
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = null,
                cursorId = null,
                limit = 3,
                sort = PostSearchSortType1.CREATED_AT,
            ),
        ).willReturn(listOf(invalidBoundaryPost, nextRawPost))

        val page = service.getPublicFeedByCursor(null, 1, PostSearchSortType1.CREATED_AT)

        assertThat(page.content.map { it.id }).containsExactly(23L)
        assertThat(page.hasNext).isFalse()
        assertThat(page.nextCursor).isNull()
        assertThat(
            meterRegistry
                .get(MAPPING_FAILURE_METRIC)
                .tag("failureType", "core")
                .counter()
                .count(),
        ).isEqualTo(1.0)
    }

    @Test
    @DisplayName("HIT_COUNT 커서 feed는 (hitCount, id) 복합 커서로 다음 페이지를 이어간다")
    fun advancesHitCountCursorByCompositeSortValueAndId() {
        val postUseCase = mock(PostUseCase::class.java)
        val service = createService(postUseCase, SimpleMeterRegistry())
        val first = postByAuthor(id = 31L).also { it.hitCountAttr = PostAttr(1L, it, HIT_COUNT, 50) }
        val second = postByAuthor(id = 30L).also { it.hitCountAttr = PostAttr(2L, it, HIT_COUNT, 50) }
        val third = postByAuthor(id = 29L).also { it.hitCountAttr = PostAttr(3L, it, HIT_COUNT, 10) }
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = null,
                cursorId = null,
                limit = 4,
                sort = PostSearchSortType1.HIT_COUNT,
            ),
        ).willReturn(listOf(first, second, third))
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = 50L,
                cursorId = 30L,
                limit = 4,
                sort = PostSearchSortType1.HIT_COUNT,
            ),
        ).willReturn(listOf(third))

        val page = service.getPublicFeedByCursor(null, 2, PostSearchSortType1.HIT_COUNT)
        val nextPage = service.getPublicFeedByCursor(page.nextCursor, 2, PostSearchSortType1.HIT_COUNT)

        assertThat(page.content.map { it.id }).containsExactly(31L, 30L)
        assertThat(page.hasNext).isTrue()
        assertThat(page.nextCursor).isNotBlank()
        assertThat(nextPage.content.map { it.id }).containsExactly(29L)
        assertThat(nextPage.hasNext).isFalse()
        then(postUseCase)
            .should()
            .findPublicByCursor(
                cursorSortValue = 50L,
                cursorId = 30L,
                limit = 4,
                sort = PostSearchSortType1.HIT_COUNT,
            )
        assertThat(page.nextCursor).contains(":HIT_COUNT:")
    }

    @Test
    @DisplayName("version 없는 legacy CREATED_AT 커서는 요청 정렬과 무관하게 거절한다")
    fun rejectsLegacyCreatedAtCursor() {
        val postUseCase = mock(PostUseCase::class.java)
        val service = createService(postUseCase, SimpleMeterRegistry())
        val legacyCursor = signLegacyCursor(sortValue = 1_767_312_000_000L, id = 40L)
        assertThatThrownBy {
            service.getPublicFeedByCursor(legacyCursor, 1, PostSearchSortType1.CREATED_AT)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("cursor 형식")
    }

    @Test
    @DisplayName("blank 또는 compiled default cursor signing secret은 즉시 거절한다")
    fun rejectsBlankOrDefaultCursorSigningSecret() {
        assertThatThrownBy {
            createService(mock(PostUseCase::class.java), SimpleMeterRegistry(), cursorSigningSecret = "")
        }.isInstanceOf(IllegalArgumentException::class.java)

        assertThatThrownBy {
            createService(
                mock(PostUseCase::class.java),
                SimpleMeterRegistry(),
                cursorSigningSecret = "aquila-post-cursor-signing-secret-change-me",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    @DisplayName("env contract placeholder 형식의 cursor signing secret은 기동을 거절한다")
    fun rejectsCursorSigningSecretPlaceholders() {
        listOf(
            "NEED_TO_CONFIGURE_CURSOR_SIGNING_SECRET_123",
            "EMPTY",
            "change_me_cursor_signing_secret_123456789",
            "change-me-cursor-signing-secret-123456789",
            "cursor-signing-secret.example.com",
            "cursor-signing-<replace-this>-secret-123456789",
            "cursor-signing-sha-<commit>-secret-123456789",
        ).forEach { placeholder ->
            assertThatThrownBy {
                createService(mock(PostUseCase::class.java), SimpleMeterRegistry(), cursorSigningSecret = placeholder)
            }.isInstanceOf(IllegalArgumentException::class.java)
        }
    }

    @Test
    @DisplayName("sort-bound 커서는 요청 정렬과 다르면 400으로 거절한다")
    fun rejectsSortBoundCursorWhenRequestSortDoesNotMatch() {
        val postUseCase = mock(PostUseCase::class.java)
        val service = createService(postUseCase, SimpleMeterRegistry())
        val first = postByAuthor(id = 51L).also { it.hitCountAttr = PostAttr(1L, it, HIT_COUNT, 20) }
        val second = postByAuthor(id = 50L).also { it.hitCountAttr = PostAttr(2L, it, HIT_COUNT, 10) }
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = null,
                cursorId = null,
                limit = 3,
                sort = PostSearchSortType1.HIT_COUNT,
            ),
        ).willReturn(listOf(first, second))

        val page = service.getPublicFeedByCursor(null, 1, PostSearchSortType1.HIT_COUNT)

        assertThat(page.nextCursor).isNotBlank()
        assertThatThrownBy {
            service.getPublicFeedByCursor(page.nextCursor, 1, PostSearchSortType1.LIKES_COUNT)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("일치하지 않습니다")
    }

    @Test
    @DisplayName("current key version과 발급 시각을 포함한 6-part cursor만 발급하고 검증한다")
    fun issuesAndVerifiesSixPartVersionedCursor() {
        val postUseCase = mock(PostUseCase::class.java)
        val service = createService(postUseCase, SimpleMeterRegistry())
        val first = postByAuthor(id = 61L)
        val second = postByAuthor(id = 60L)
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = null,
                cursorId = null,
                limit = 3,
                sort = PostSearchSortType1.CREATED_AT,
            ),
        ).willReturn(listOf(first, second))
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = Instant.parse("2026-01-02T00:00:00Z").toEpochMilli(),
                cursorId = 61L,
                limit = 3,
                sort = PostSearchSortType1.CREATED_AT,
            ),
        ).willReturn(listOf(second))

        val page = service.getPublicFeedByCursor(null, 1, PostSearchSortType1.CREATED_AT)
        val nextPage = service.getPublicFeedByCursor(page.nextCursor, 1, PostSearchSortType1.CREATED_AT)

        assertThat(page.nextCursor!!.split(':')).hasSize(6)
        assertThat(page.nextCursor).startsWith("$CURSOR_TEST_VERSION:${CURSOR_TEST_CLOCK.instant().epochSecond}:")
        assertThat(nextPage.content.map { it.id }).containsExactly(60L)
    }

    @Test
    @DisplayName("current version token은 previous key signature를 재시도하지 않고 거절한다")
    fun rejectsCurrentVersionTokenSignedByPreviousKey() {
        val postUseCase = mock(PostUseCase::class.java)
        val previousSecret = "previous-cursor-signing-secret-abcdefghijklmnopqrstuvwxyz0123456789"
        val service =
            createService(
                postUseCase,
                SimpleMeterRegistry(),
                previousSigningSecret = previousSecret,
                previousSigningKeyVersion = "1",
                previousExpiresAtEpochSeconds = (CURSOR_TEST_CLOCK.instant().epochSecond + 60).toString(),
            )
        val payload = "$CURSOR_TEST_VERSION:${CURSOR_TEST_CLOCK.instant().epochSecond}:1:1:CREATED_AT"
        val token = "$payload:${signCursorPayload(payload, previousSecret)}"

        assertThatThrownBy {
            service.getPublicFeedByCursor(token, 1, PostSearchSortType1.CREATED_AT)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("서명이 유효하지")
    }

    @Test
    @DisplayName("유효한 previous version cursor는 expiry 전에는 해당 key 하나로 검증한다")
    fun acceptsValidPreviousVersionCursorBeforeExpiry() {
        val postUseCase = mock(PostUseCase::class.java)
        val previousSecret = "previous-cursor-signing-secret-abcdefghijklmnopqrstuvwxyz0123456789"
        val service =
            createService(
                postUseCase,
                SimpleMeterRegistry(),
                previousSigningSecret = previousSecret,
                previousSigningKeyVersion = "1",
                previousExpiresAtEpochSeconds = (CURSOR_TEST_CLOCK.instant().epochSecond + 60).toString(),
            )
        val payload = "1:${CURSOR_TEST_CLOCK.instant().epochSecond}:1:1:CREATED_AT"
        val token = "$payload:${signCursorPayload(payload, previousSecret)}"
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = 1L,
                cursorId = 1L,
                limit = 3,
                sort = PostSearchSortType1.CREATED_AT,
            ),
        ).willReturn(emptyList())

        val page = service.getPublicFeedByCursor(token, 1, PostSearchSortType1.CREATED_AT)

        assertThat(page.content).isEmpty()
    }

    @Test
    @DisplayName("previous key expiry 후에는 같은 version cursor를 즉시 거절한다")
    fun rejectsPreviousVersionCursorAfterRuntimeExpiry() {
        val clock = MutableClock(CURSOR_TEST_CLOCK.instant())
        val previousSecret = "previous-cursor-signing-secret-abcdefghijklmnopqrstuvwxyz0123456789"
        val service =
            createService(
                mock(PostUseCase::class.java),
                SimpleMeterRegistry(),
                previousSigningSecret = previousSecret,
                previousSigningKeyVersion = "1",
                previousExpiresAtEpochSeconds = (clock.instant().epochSecond + 60).toString(),
                clock = clock,
            )
        val payload = "1:${clock.instant().epochSecond}:1:1:CREATED_AT"
        val token = "$payload:${signCursorPayload(payload, previousSecret)}"
        clock.current = clock.instant().plusSeconds(60)

        assertThatThrownBy {
            service.getPublicFeedByCursor(token, 1, PostSearchSortType1.CREATED_AT)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("만료")
    }

    @Test
    @DisplayName("future 또는 24시간 초과 cursor와 unknown version은 거절한다")
    fun rejectsFutureExpiredOrUnknownVersionCursor() {
        val service = createService(mock(PostUseCase::class.java), SimpleMeterRegistry())
        val now = CURSOR_TEST_CLOCK.instant().epochSecond
        listOf(
            "$CURSOR_TEST_VERSION:${now + 1}:1:1:CREATED_AT",
            "$CURSOR_TEST_VERSION:${now - 86_401}:1:1:CREATED_AT",
            "3:$now:1:1:CREATED_AT",
        ).forEach { payload ->
            val token = "$payload:${signCursorPayload(payload, CURSOR_TEST_SECRET)}"
            assertThatThrownBy {
                service.getPublicFeedByCursor(token, 1, PostSearchSortType1.CREATED_AT)
            }.isInstanceOf(AppException::class.java)
        }
    }

    @Test
    @DisplayName("malformed cursor key version은 공개 경계에서 BAD_REQUEST로 거절한다")
    fun rejectsMalformedCursorKeyVersionAsBadRequest() {
        val service = createService(mock(PostUseCase::class.java), SimpleMeterRegistry())
        val now = CURSOR_TEST_CLOCK.instant().epochSecond
        listOf("abc", "0", "007", "-1", "9223372036854775808").forEach { version ->
            val payload = "$version:$now:1:1:CREATED_AT"
            val token = "$payload:${signCursorPayload(payload, CURSOR_TEST_SECRET)}"

            assertThatThrownBy {
                service.getPublicFeedByCursor(token, 1, PostSearchSortType1.CREATED_AT)
            }.isInstanceOfSatisfying(AppException::class.java) { exception ->
                assertThat(exception.errorCode).isEqualTo(com.back.global.exception.application.ErrorCode.BAD_REQUEST)
            }
        }
    }

    @Test
    @DisplayName("invalid cursor 원문과 signature를 로그에 남기지 않고 presence만 기록한다")
    fun redactsInvalidCursorFromFeedAndExploreLogs() {
        val service = createService(mock(PostUseCase::class.java), SimpleMeterRegistry())
        val rawCursor = "2:${CURSOR_TEST_CLOCK.instant().epochSecond}:1:1:CREATED_AT:raw-signature-sentinel-not-to-log"
        val appender = attachListAppender()
        try {
            assertThatThrownBy {
                service.getPublicFeedByCursor(rawCursor, 1, PostSearchSortType1.CREATED_AT)
            }.isInstanceOf(AppException::class.java)
            assertThatThrownBy {
                service.getPublicExploreByCursor(rawCursor, 1, "kotlin", PostSearchSortType1.CREATED_AT)
            }.isInstanceOf(AppException::class.java)

            val messages = appender.list.map(ILoggingEvent::getFormattedMessage)
            assertThat(messages).anyMatch { it.contains("endpoint=feed-cursor") && it.contains("cursorPresent=true") }
            assertThat(messages).anyMatch { it.contains("endpoint=explore-cursor") && it.contains("cursorPresent=true") }
            assertThat(messages).noneMatch { it.contains(rawCursor) || it.contains("raw-signature-sentinel-not-to-log") }
        } finally {
            detachListAppender(appender)
        }
    }

    @Test
    @DisplayName("previous key는 current key와 같거나 rotation window 밖이면 기동을 거절한다")
    fun rejectsInvalidPreviousKeyringConfiguration() {
        assertThatThrownBy {
            createService(
                mock(PostUseCase::class.java),
                SimpleMeterRegistry(),
                previousSigningSecret = "previous-cursor-signing-secret-abcdefghijklmnopqrstuvwxyz0123456789",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)

        assertThatThrownBy {
            createService(
                mock(PostUseCase::class.java),
                SimpleMeterRegistry(),
                previousSigningSecret = CURSOR_TEST_SECRET,
                previousSigningKeyVersion = "1",
                previousExpiresAtEpochSeconds = (CURSOR_TEST_CLOCK.instant().epochSecond + 60).toString(),
            )
        }.isInstanceOf(IllegalArgumentException::class.java)

        assertThatThrownBy {
            createService(
                mock(PostUseCase::class.java),
                SimpleMeterRegistry(),
                previousSigningSecret = "previous-cursor-signing-secret-abcdefghijklmnopqrstuvwxyz0123456789",
                previousSigningKeyVersion = "3",
                previousExpiresAtEpochSeconds = (CURSOR_TEST_CLOCK.instant().epochSecond + 60).toString(),
            )
        }.isInstanceOf(IllegalArgumentException::class.java)

        assertThatThrownBy {
            createService(
                mock(PostUseCase::class.java),
                SimpleMeterRegistry(),
                cursorSigningKeyVersion = "02",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)

        assertThatThrownBy {
            createService(
                mock(PostUseCase::class.java),
                SimpleMeterRegistry(),
                previousSigningSecret = "previous-cursor-signing-secret-abcdefghijklmnopqrstuvwxyz0123456789",
                previousSigningKeyVersion = "1",
                previousExpiresAtEpochSeconds = (CURSOR_TEST_CLOCK.instant().epochSecond + 86_401).toString(),
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    @DisplayName("search는 매핑 실패로 빈 응답이 되어도 negative cache를 기록하지 않는다")
    fun doesNotNegativeCacheSearchWhenRowsAreFilteredByMappingFailure() {
        val postUseCase = mock(PostUseCase::class.java)
        val service = createService(postUseCase, SimpleMeterRegistry())
        val invalidPost = postWithMissingAuthor(id = 30L)
        given(postUseCase.findPagedByKw("kw", PostSearchSortType1.CREATED_AT, 1, 10))
            .willReturn(
                PagedResult(
                    content = listOf(invalidPost),
                    page = 1,
                    pageSize = 10,
                    totalElements = 1,
                ),
            )

        val firstPage = service.getPublicSearch(1, 10, "kw", PostSearchSortType1.CREATED_AT)
        val secondPage = service.getPublicSearch(1, 10, "kw", PostSearchSortType1.CREATED_AT)

        assertThat(firstPage.content).isEmpty()
        assertThat(secondPage.content).isEmpty()
        then(postUseCase)
            .should(times(2))
            .findPagedByKw("kw", PostSearchSortType1.CREATED_AT, 1, 10)
    }

    @Test
    @DisplayName("search negative cache write 실패는 공개 응답을 유지하고 실패 metric을 기록한다")
    fun isolatesSearchNegativeCacheWriteFailure() {
        val postUseCase = mock(PostUseCase::class.java)
        val meterRegistry = SimpleMeterRegistry()
        val cache = mock(Cache::class.java)
        doThrow(IllegalStateException("redis unavailable")).`when`(cache).put("page=1:size=10:sort=CREATED_AT:kw=kw", true)
        val cacheManager = mock(CacheManager::class.java)
        `when`(cacheManager.getCache(PostQueryCacheNames.SEARCH_NEGATIVE)).thenReturn(cache)
        val service = createService(postUseCase, meterRegistry, cacheManager = cacheManager)
        given(postUseCase.findPagedByKw("kw", PostSearchSortType1.CREATED_AT, 1, 10))
            .willReturn(PagedResult(content = emptyList(), page = 1, pageSize = 10, totalElements = 0))

        val page = service.getPublicSearch(1, 10, "kw", PostSearchSortType1.CREATED_AT)

        assertThat(page.content).isEmpty()
        assertThat(
            meterRegistry
                .find("post.read.cache.write.failure")
                .tag("cache", PostQueryCacheNames.SEARCH_NEGATIVE)
                .tag("operation", "put")
                .counter()!!
                .count(),
        ).isEqualTo(1.0)
    }

    @Test
    @DisplayName("상세 캐시가 모두 cold miss면 findPublicDetailById 1회로 meta/content/snapshot 캐시를 채우고 findPublicDetailContentById를 중복 호출하지 않는다")
    fun loadsPublicPostDetailInSinglePassOnColdCacheMiss() {
        val postUseCase = mock(PostUseCase::class.java)
        val cacheManager = ConcurrentMapCacheManager()
        val service = createService(postUseCase, SimpleMeterRegistry(), cacheManager = cacheManager)
        val post =
            postByAuthor(id = 77L).apply {
                title = "단일 패스 상세"
                content = "단일 패스 본문"
                likesCountAttr = PostAttr(1L, this, LIKES_COUNT, 9)
                hitCountAttr = PostAttr(2L, this, HIT_COUNT, 42)
            }
        given(postUseCase.isPublicDetailReadable(77L)).willReturn(true)
        given(postUseCase.findPublicDetailById(77L)).willReturn(post)

        val detail = service.getPublicPostDetail(77L)

        assertThat(detail.id).isEqualTo(77L)
        assertThat(detail.title).isEqualTo("단일 패스 상세")
        assertThat(detail.content).isEqualTo("단일 패스 본문")
        assertThat(detail.likesCount).isEqualTo(9)
        assertThat(detail.hitCount).isEqualTo(42)
        then(postUseCase).should(times(1)).findPublicDetailById(77L)
        then(postUseCase).should(never()).findPublicDetailContentById(77L)
        assertThat(
            cacheManager
                .getCache(PostQueryCacheNames.DETAIL_PUBLIC_META)
                ?.get(77L, PublicPostDetailMetaCacheDto::class.java),
        ).isNotNull()
        assertThat(
            cacheManager
                .getCache(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT)
                ?.get(77L, PublicPostDetailContentCacheDto::class.java),
        ).isNotNull()
        assertThat(
            cacheManager
                .getCache(PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT)
                ?.get(77L, PublicPostDetailSnapshotCacheDto::class.java),
        ).isNotNull()
    }

    @Test
    @DisplayName("상세 meta 캐시가 warm이고 content 캐시가 cold miss면 findPublicDetailContentById로 본문만 보충한다")
    fun loadsContentOnlyWhenDetailMetaCacheIsWarmAndContentCacheIsCold() {
        val postUseCase = mock(PostUseCase::class.java)
        val cacheManager = ConcurrentMapCacheManager()
        val service = createService(postUseCase, SimpleMeterRegistry(), cacheManager = cacheManager)
        val post =
            postByAuthor(id = 78L).apply {
                title = "메타 캐시 히트 글"
                content = "원본 본문"
                likesCountAttr = PostAttr(1L, this, LIKES_COUNT, 3)
                hitCountAttr = PostAttr(2L, this, HIT_COUNT, 14)
            }
        cacheManager
            .getCache(PostQueryCacheNames.DETAIL_PUBLIC_META)!!
            .put(78L, PublicPostDetailMetaCacheDto.from(post))
        given(postUseCase.isPublicDetailReadable(78L)).willReturn(true)
        given(postUseCase.findPublicDetailContentById(78L)).willReturn(
            PublicPostDetailContentCacheDto(
                content = "보충된 본문",
            ),
        )

        val detail = service.getPublicPostDetail(78L)

        assertThat(detail.id).isEqualTo(78L)
        assertThat(detail.title).isEqualTo("메타 캐시 히트 글")
        assertThat(detail.content).isEqualTo("보충된 본문")
        assertThat(detail.likesCount).isEqualTo(3)
        assertThat(detail.hitCount).isEqualTo(14)
        then(postUseCase).should(never()).findPublicDetailById(78L)
        then(postUseCase).should(times(1)).findPublicDetailContentById(78L)
    }

    @Test
    @DisplayName("상세 캐시 cold miss 중 후속 요청이 겹쳐도 같은 게시글 ID에 대한 로드는 직렬화되고 종료 후 락 레지스트리를 비운다")
    fun serializesConcurrentColdDetailLoadsEvenWhenThirdThreadArrivesAfterFirstCompletes() {
        val postUseCase = mock(PostUseCase::class.java)
        val noOpCacheManager = mock(CacheManager::class.java)
        val service = createService(postUseCase, SimpleMeterRegistry(), cacheManager = noOpCacheManager)
        val post =
            postByAuthor(id = 88L).apply {
                title = "동시성 락 검증"
                content = "동시성 본문"
            }
        val threadAEntered = CountDownLatch(1)
        val releaseThreadA = CountDownLatch(1)
        val threadBEntered = CountDownLatch(1)
        val releaseThreadB = CountDownLatch(1)
        val activeCalls = AtomicInteger(0)
        val maxConcurrentCalls = AtomicInteger(0)
        val callSequence = AtomicInteger(0)

        given(postUseCase.isPublicDetailReadable(88L)).willReturn(true)
        given(postUseCase.findPublicDetailById(88L)).willAnswer {
            val currentActive = activeCalls.incrementAndGet()
            maxConcurrentCalls.accumulateAndGet(currentActive) { prev, next -> max(prev, next) }
            try {
                when (callSequence.incrementAndGet()) {
                    1 -> {
                        threadAEntered.countDown()
                        releaseThreadA.await(5, TimeUnit.SECONDS)
                    }
                    2 -> {
                        threadBEntered.countDown()
                        releaseThreadB.await(5, TimeUnit.SECONDS)
                    }
                }
                post
            } finally {
                activeCalls.decrementAndGet()
            }
        }

        val threadA = Thread { service.getPublicPostDetail(88L) }
        val threadB = Thread { service.getPublicPostDetail(88L) }
        val threadC = Thread { service.getPublicPostDetail(88L) }

        threadA.start()
        assertThat(threadAEntered.await(5, TimeUnit.SECONDS)).isTrue()

        threadB.start()
        val deadlineB = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (threadB.state != Thread.State.BLOCKED && System.nanoTime() < deadlineB) {
            Thread.onSpinWait()
        }
        assertThat(threadB.state).isEqualTo(Thread.State.BLOCKED)

        releaseThreadA.countDown()
        threadA.join(5_000)
        assertThat(threadBEntered.await(5, TimeUnit.SECONDS)).isTrue()

        threadC.start()
        val deadlineC = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (
            threadC.state != Thread.State.BLOCKED &&
            maxConcurrentCalls.get() < 2 &&
            threadC.isAlive &&
            System.nanoTime() < deadlineC
        ) {
            Thread.onSpinWait()
        }

        releaseThreadB.countDown()
        threadB.join(5_000)
        threadC.join(5_000)

        assertThat(maxConcurrentCalls.get()).isEqualTo(1)
        then(postUseCase).should(times(3)).findPublicDetailById(88L)

        val lockRegistryField =
            PostPublicReadQueryService::class.java
                .getDeclaredField("detailCacheLockRegistry")
                .apply { isAccessible = true }
        val lockRegistry = lockRegistryField.get(service) as Map<*, *>
        assertThat(lockRegistry).isEmpty()
    }

    @Test
    @DisplayName("캐시 키 토큰 정규화 및 해시 축약과 캐시 우회 조건을 일관되게 계산한다")
    fun normalizesAndHashesCacheKeyTokensAndEvaluatesBypassRules() {
        assertThat(PostPublicReadQueryService.toCacheKeyToken("   ")).isEqualTo("_")
        assertThat(PostPublicReadQueryService.toCacheKeyToken("  Kotlin   Spring  ")).isEqualTo("kotlin spring")

        val longToken = "  Very-Long-Search-Keyword-Token-Exceeding-Twenty-Four-Chars  "
        val hashedToken = PostPublicReadQueryService.toCacheKeyToken(longToken)
        assertThat(hashedToken).matches("^__h:[0-9a-f]{24}$")
        assertThat(PostPublicReadQueryService.toCacheKeyToken("very-long-search-keyword-token-exceeding-twenty-four-chars"))
            .isEqualTo(hashedToken)

        assertThat(PostPublicReadQueryService.shouldBypassExploreCache(1, "kotlin", "spring")).isFalse()
        assertThat(PostPublicReadQueryService.shouldBypassExploreCache(11, "kotlin", "spring")).isTrue()
        assertThat(PostPublicReadQueryService.shouldBypassExploreCache(1, "a".repeat(25), "spring")).isTrue()
        assertThat(PostPublicReadQueryService.shouldBypassExploreCache(1, "kotlin", "b".repeat(25))).isTrue()
        assertThat(PostPublicReadQueryService.shouldBypassExploreCache(1, "a".repeat(20), "b".repeat(13))).isTrue()

        assertThat(PostPublicReadQueryService.shouldBypassSearchCache(1, "   ")).isTrue()
        assertThat(PostPublicReadQueryService.shouldBypassSearchCache(1, "kotlin")).isFalse()
        assertThat(PostPublicReadQueryService.shouldBypassSearchCache(11, "kotlin")).isTrue()
        assertThat(PostPublicReadQueryService.shouldBypassSearchCache(1, "a".repeat(25))).isTrue()

        assertThat(PostPublicReadQueryService.isFirstCursorRequest(null)).isTrue()
        assertThat(PostPublicReadQueryService.isFirstCursorRequest("  ")).isTrue()
        assertThat(PostPublicReadQueryService.isFirstCursorRequest("cursor-token")).isFalse()

        assertThat(
            PostPublicReadQueryService.buildBootstrapCacheKey(
                pageSize = 20,
                sort = PostSearchSortType1.CREATED_AT,
                tag = "  Spring  Boot ",
            ),
        ).isEqualTo("size=20:sort=CREATED_AT:tag=spring boot")
    }

    private fun createService(
        postUseCase: PostUseCase,
        meterRegistry: SimpleMeterRegistry,
        cursorSigningSecret: String = CURSOR_TEST_SECRET,
        cursorSigningKeyVersion: String = CURSOR_TEST_VERSION,
        previousSigningSecret: String = "",
        previousSigningKeyVersion: String = "",
        previousExpiresAtEpochSeconds: String = "",
        clock: Clock = CURSOR_TEST_CLOCK,
        cacheManager: CacheManager = ConcurrentMapCacheManager(),
    ): PostPublicReadQueryService =
        PostPublicReadQueryService(
            postUseCase = postUseCase,
            postReadBulkheadService =
                PostReadBulkheadService(
                    enabled = false,
                    acquireTimeoutMs = 0,
                    feedMaxConcurrent = 1,
                    exploreMaxConcurrent = 1,
                    searchMaxConcurrent = 1,
                    detailMaxConcurrent = 1,
                    tagsMaxConcurrent = 1,
                ),
            cacheManager = cacheManager,
            meterRegistry = meterRegistry,
            cursorSigningSecret = cursorSigningSecret,
            cursorSigningKeyVersion = cursorSigningKeyVersion,
            cursorPreviousSigningSecret = previousSigningSecret,
            cursorPreviousSigningKeyVersion = previousSigningKeyVersion,
            cursorPreviousExpiresAtEpochSeconds = previousExpiresAtEpochSeconds,
            detailContentCacheMaxChars = 120000,
            detailSnapshotCacheMaxChars = 180000,
            clock = clock,
        )

    private fun signLegacyCursor(
        sortValue: Long,
        id: Long,
    ): String {
        val payload = "$sortValue:$id"
        return "$payload:${signCursorPayload(payload, CURSOR_TEST_SECRET)}"
    }

    private fun signCursorPayload(
        payload: String,
        secret: String,
    ): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(StandardCharsets.UTF_8), "HmacSHA256"))
        val digest = mac.doFinal(payload.toByteArray(StandardCharsets.UTF_8))
        val signature = Base64.getUrlEncoder().withoutPadding().encodeToString(digest.copyOf(18))
        return signature
    }

    private fun postByAuthor(id: Long): Post =
        postWithoutAuditTimestamps(id).apply {
            createdAt = Instant.parse("2026-01-02T00:00:00Z")
            modifiedAt = Instant.parse("2026-01-02T00:01:00Z")
        }

    private fun postWithMissingAuthor(id: Long): Post =
        postByAuthor(id).also { post ->
            Post::class.java
                .getDeclaredField("author")
                .apply { isAccessible = true }
                .set(post, null)
        }

    private fun postWithoutAuditTimestamps(id: Long): Post =
        Post(
            id = id,
            author =
                Member(
                    id = 1L,
                    username = "aquila-login",
                    password = null,
                    nickname = "아퀼라",
                    email = null,
                ).apply {
                    createdAt = Instant.parse("2026-01-01T00:00:00Z")
                    modifiedAt = Instant.parse("2026-01-01T00:01:00Z")
                    setProfileWorkspacePublishedContent(MemberProfileWorkspaceContent())
                },
            title = "작성자 매핑",
            content = "본문",
            published = true,
            listed = true,
        )

    private class MutableClock(
        var current: Instant,
    ) : Clock() {
        override fun getZone() = ZoneOffset.UTC

        override fun withZone(zone: java.time.ZoneId): Clock = this

        override fun instant(): Instant = current
    }

    private fun attachListAppender(): ListAppender<ILoggingEvent> {
        val logger = LoggerFactory.getLogger(PostPublicReadQueryService::class.java) as Logger
        return ListAppender<ILoggingEvent>().also {
            it.start()
            logger.addAppender(it)
        }
    }

    private fun detachListAppender(appender: ListAppender<ILoggingEvent>) {
        val logger = LoggerFactory.getLogger(PostPublicReadQueryService::class.java) as Logger
        logger.detachAppender(appender)
        appender.stop()
    }
}
