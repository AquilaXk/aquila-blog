package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.input.PostPublicReadQueryUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.service.PostPublicReadQueryService
import com.back.boundedContexts.post.application.service.PostQueryCacheNames
import com.back.boundedContexts.post.application.service.PostReadBulkheadService
import com.back.boundedContexts.post.application.support.PostCacheTags
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.AdjacentPostsDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.model.PostSummarySource
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.web.application.Rq
import com.back.standard.util.Ut
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.springframework.cache.CacheManager
import org.springframework.cache.concurrent.ConcurrentMapCacheManager
import org.springframework.cache.support.NoOpCacheManager
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.time.Clock
import java.time.Instant

@DisplayName("공개 인접 글 키셋 API 단위 테스트")
class ApiV1PostPublicReadControllerAdjacentTest {
    companion object {
        @JvmStatic
        @BeforeAll
        fun setupObjectMapper() {
            Ut.JSON.objectMapper = jacksonObjectMapper()
            AppConfig(
                siteBackUrl = "https://api.example.com",
                siteFrontUrl = "https://example.com",
            )
        }
    }

    private val postUseCase = mock(PostUseCase::class.java)
    private val postPublicReadQueryUseCase = mock(PostPublicReadQueryUseCase::class.java)
    private val postPublicReadResponseFactory = PostPublicReadResponseFactory()
    private val postSearchIntentResolver = mock(PostSearchIntentResolver::class.java)
    private val postWebDtoAssembler = mock(PostWebDtoAssembler::class.java)
    private val rq = mock(Rq::class.java)

    private val controller =
        ApiV1PostPublicReadController(
            postUseCase = postUseCase,
            postPublicReadQueryUseCase = postPublicReadQueryUseCase,
            postPublicReadResponseFactory = postPublicReadResponseFactory,
            postSearchIntentResolver = postSearchIntentResolver,
            postWebDtoAssembler = postWebDtoAssembler,
            rq = rq,
        )

    @Test
    @DisplayName("controller getAdjacent는 캐시 정책, surrogate keys, weak etag를 정상 헤더에 싣는다")
    fun controllerGetAdjacentReturnsResponseWithHeaders() {
        val request = MockHttpServletRequest()
        val response = MockHttpServletResponse()
        val dto =
            AdjacentPostsDto(
                previousPost = feedPostDto(1L, "이전 글"),
                nextPost = feedPostDto(3L, "다음 글"),
            )
        given(postPublicReadQueryUseCase.getAdjacentPosts(2L)).willReturn(dto)

        val entity = controller.getAdjacent(request, response, 2L)

        assertThat(entity.statusCode.value()).isEqualTo(200)
        assertThat(entity.body).isEqualTo(dto)
        val etag = response.getHeader("ETag")
        assertThat(etag).isNotNull().startsWith("W/\"")
        val cacheControl = response.getHeader("Cache-Control")
        assertThat(cacheControl).contains("max-age=15", "s-maxage=45", "stale-while-revalidate=45")
        val surrogateKeys = response.getHeader("Surrogate-Key")
        assertThat(surrogateKeys).contains(PostCacheTags.LIST, PostCacheTags.DETAIL)
        verify(postPublicReadQueryUseCase).getAdjacentPosts(2L)
    }

    @Test
    @DisplayName("service getAdjacentPosts는 미삭제 공개 글이 아니면 404를 발생시킨다")
    fun serviceThrowsNotFoundWhenNotReadable() {
        val service = createService()
        given(postUseCase.isPublicDetailReadable(999L)).willReturn(false)

        assertThatThrownBy { service.getAdjacentPosts(999L) }
            .isInstanceOf(AppException::class.java)
            .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NOT_FOUND)
    }

    @Test
    @DisplayName("service getAdjacentPosts는 음수 캐시가 이미 적중되면 DB 조회 없이 404를 반환한다")
    fun serviceThrowsNotFoundWhenNegativeCached() {
        val cacheManager = ConcurrentMapCacheManager(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE)
        cacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE)?.put(998L, true)
        val service = createService(cacheManager)

        assertThatThrownBy { service.getAdjacentPosts(998L) }
            .isInstanceOf(AppException::class.java)
            .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NOT_FOUND)
        verify(postUseCase, never()).isPublicDetailReadable(998L)
    }

    @Test
    @DisplayName("service getAdjacentPosts는 findPublicDetailById가 null이면 404를 발생시킨다")
    fun serviceThrowsNotFoundWhenPostMissing() {
        val service = createService()
        given(postUseCase.isPublicDetailReadable(100L)).willReturn(true)
        given(postUseCase.findPublicDetailById(100L)).willReturn(null)

        assertThatThrownBy { service.getAdjacentPosts(100L) }
            .isInstanceOf(AppException::class.java)
            .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NOT_FOUND)
    }

    @Test
    @DisplayName("service getAdjacentPosts는 listed가 false면 인접 조회를 건너뛰고 null 쌍을 반환한다")
    fun serviceReturnsNullPairForUnlistedPost() {
        val service = createService()
        val unlistedPost = createPost(id = 10L, listed = false)
        given(postUseCase.isPublicDetailReadable(10L)).willReturn(true)
        given(postUseCase.findPublicDetailById(10L)).willReturn(unlistedPost)

        val result = service.getAdjacentPosts(10L)

        assertThat(result.previousPost).isNull()
        assertThat(result.nextPost).isNull()
    }

    @Test
    @DisplayName("service getAdjacentPosts는 listed가 true면 이전/다음 글을 조회해 DTO로 변환한다")
    fun serviceReturnsAdjacentFeedPosts() {
        val service = createService()
        val curPost = createPost(id = 20L, listed = true)
        val prevPost = createPost(id = 15L, listed = true)
        val nextPost = createPost(id = 25L, listed = true)

        given(postUseCase.isPublicDetailReadable(20L)).willReturn(true)
        given(postUseCase.findPublicDetailById(20L)).willReturn(curPost)
        given(postUseCase.findAdjacentPublicPosts(curPost.createdAt, 20L)).willReturn(prevPost to nextPost)

        val result = service.getAdjacentPosts(20L)

        assertThat(result.previousPost?.id).isEqualTo(15L)
        assertThat(result.nextPost?.id).isEqualTo(25L)

        given(postUseCase.findAdjacentPublicPosts(curPost.createdAt, 20L)).willReturn(null to null)
        val emptyAdjacent = service.getAdjacentPosts(20L)
        assertThat(emptyAdjacent.previousPost).isNull()
        assertThat(emptyAdjacent.nextPost).isNull()
    }

    @Test
    @DisplayName("buildAdjacentEtagSeed 및 buildAdjacentWeakEtag 일관성 검증")
    fun etagSeedAndWeakEtagConsistency() {
        val dto1 =
            AdjacentPostsDto(
                previousPost = feedPostDto(1L, "이전"),
                nextPost = feedPostDto(3L, "다음"),
            )
        val dto2 = AdjacentPostsDto(null, null)

        val seed1 = postPublicReadResponseFactory.buildAdjacentEtagSeed(2L, dto1)
        val weakEtag1 = postPublicReadResponseFactory.buildAdjacentWeakEtag(2L, dto1)
        val seed2 = postPublicReadResponseFactory.buildAdjacentEtagSeed(2L, dto2)
        val weakEtag2 = postPublicReadResponseFactory.buildAdjacentWeakEtag(2L, dto2)

        assertThat(seed1).contains("adjacent|id=2")
        assertThat(weakEtag1).startsWith("W/\"")
        assertThat(weakEtag2).startsWith("W/\"")
        assertThat(weakEtag1).isNotEqualTo(weakEtag2)
    }

    @Test
    @DisplayName("AdjacentPostsDto 기본 생성자 및 프로퍼티 커버리지")
    fun adjacentPostsDtoConstructors() {
        val defaultDto = AdjacentPostsDto()
        assertThat(defaultDto.previousPost).isNull()
        assertThat(defaultDto.nextPost).isNull()

        val prevOnly = AdjacentPostsDto(previousPost = feedPostDto(1L, "이전"))
        assertThat(prevOnly.previousPost).isNotNull
        assertThat(prevOnly.nextPost).isNull()

        val nextOnly = AdjacentPostsDto(nextPost = feedPostDto(2L, "다음"))
        assertThat(nextOnly.previousPost).isNull()
        assertThat(nextOnly.nextPost).isNotNull
    }

    private fun createService(cacheManager: CacheManager = NoOpCacheManager()) =
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
            meterRegistry = null,
            cursorSigningSecret = "test-cursor-signing-secret-abcdefghijklmnopqrstuvwxyz0123456789",
            cursorSigningKeyVersion = "1",
            cursorPreviousSigningSecret = "",
            cursorPreviousSigningKeyVersion = "",
            cursorPreviousExpiresAtEpochSeconds = "",
            detailContentCacheMaxChars = 120000,
            detailSnapshotCacheMaxChars = 180000,
            clock = Clock.systemUTC(),
        )

    private fun createPost(
        id: Long,
        listed: Boolean,
    ): Post {
        val now = Instant.now()
        val author =
            Member(id = 1L, username = "author", nickname = "작성자", apiKey = "key").apply {
                createdAt = now
                modifiedAt = now
                setProfileWorkspacePublishedContent(
                    com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent(
                        profileImageUrl = "https://example.com/profile.png",
                    ),
                )
                getProfileWorkspacePublishedAttr().apply {
                    createdAt = now
                    modifiedAt = now
                }
            }
        val post =
            Post(
                id = id,
                author = author,
                title = "글 $id",
                content = "본문 $id",
                published = true,
                listed = listed,
            )
        post.createdAt = now
        post.modifiedAt = now
        return post
    }

    private fun feedPostDto(
        id: Long,
        title: String,
    ): FeedPostDto =
        FeedPostDto(
            id = id,
            createdAt = Instant.now(),
            modifiedAt = Instant.now(),
            authorId = 1L,
            authorName = "author",
            authorUsername = "author",
            authorProfileImgUrl = "",
            title = title,
            thumbnail = null,
            summary = "요약",
            summarySource = PostSummarySource.NONE,
            tags = emptyList(),
            category = emptyList(),
            published = true,
            listed = true,
            likesCount = 0,
            hitCount = 0,
        )
}
