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
import com.back.boundedContexts.post.dto.AdmPostRevisionRestoreRequest
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.PublicPostBacklinkItemDto
import com.back.boundedContexts.post.dto.PublicPostBacklinksResBody
import com.back.boundedContexts.post.dto.PublicWikilinkCatalogResBody
import com.back.boundedContexts.post.model.PostSummarySource
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.web.application.Rq
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
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
    @DisplayName("controller getItem은 익명은 publicReadQueryUseCase에, 인증 사용자는 getAuthenticatedPostDetail에 위임한다")
    fun controllerGetItemRoutesAnonymousAndAuthenticatedRequests() {
        val publicDto = mock(PostWithContentDto::class.java)
        given(rq.actorOrNull).willReturn(null)
        given(postPublicReadQueryUseCase.getPublicPostDetail(55L)).willReturn(publicDto)

        val anonResponse = MockHttpServletResponse()
        val anonEntity = controller.getItem(MockHttpServletRequest(), anonResponse, 55L)
        assertThat(anonEntity.statusCode.value()).isEqualTo(200)
        assertThat(anonEntity.body).isSameAs(publicDto)
        verify(postPublicReadQueryUseCase).getPublicPostDetail(55L)

        val actor =
            Member(
                id = 7L,
                username = "member7",
                password = null,
                nickname = "작성자",
                email = null,
                apiKey = "api-7",
            )
        val authDto = mock(PostWithContentDto::class.java)
        given(rq.actorOrNull).willReturn(actor)
        given(rq.actor).willReturn(actor)
        given(rq.hasRole("ADMIN")).willReturn(false)
        given(postUseCase.getAuthenticatedPostDetail(id = 56L, actor = actor, hasAdminRole = false))
            .willReturn(authDto)

        val authResponse = MockHttpServletResponse()
        val authEntity = controller.getItem(MockHttpServletRequest(), authResponse, 56L)
        assertThat(authEntity.statusCode.value()).isEqualTo(200)
        assertThat(authEntity.body).isSameAs(authDto)
        assertThat(authResponse.getHeader("Cache-Control")).contains("private", "no-store")
        verify(postUseCase).getAuthenticatedPostDetail(id = 56L, actor = actor, hasAdminRole = false)
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
    @DisplayName("인접 글 캐시 히트 시 DB 호출이 0회이며 수정 및 삭제 후 캐시가 무효화되어 최신 결과가 반환된다")
    fun adjacentPostsCacheHitZeroDbCallsAndInvalidatesOnWrite() {
        val cacheManager =
            ConcurrentMapCacheManager(
                PostQueryCacheNames.FEED,
                PostQueryCacheNames.EXPLORE,
                PostQueryCacheNames.FEED_CURSOR_FIRST,
                PostQueryCacheNames.EXPLORE_CURSOR_FIRST,
                PostQueryCacheNames.BOOTSTRAP,
                PostQueryCacheNames.SEARCH,
                PostQueryCacheNames.SEARCH_NEGATIVE,
                PostQueryCacheNames.TAGS,
                PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT,
                PostQueryCacheNames.DETAIL_PUBLIC_META,
                PostQueryCacheNames.DETAIL_PUBLIC_CONTENT,
                PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE,
                PostQueryCacheNames.ADJACENT_POSTS,
            )
        val service = createService(cacheManager)
        val invalidator =
            com.back.boundedContexts.post.application.service
                .PostReadCacheInvalidator(cacheManager)

        val curPost = createPost(id = 50L, listed = true)
        val prevPost1 = createPost(id = 40L, listed = true)
        val nextPost1 = createPost(id = 60L, listed = true)
        val prevPost2 = createPost(id = 45L, listed = true) // 새로 삽입된 글

        given(postUseCase.isPublicDetailReadable(50L)).willReturn(true)
        given(postUseCase.findPublicDetailById(50L)).willReturn(curPost)
        given(postUseCase.findAdjacentPublicPosts(curPost.createdAt, 50L)).willReturn(prevPost1 to nextPost1)

        // 1) 첫 조회: 캐시 미스 -> DB 조회
        val firstResult = service.getAdjacentPosts(50L)
        assertThat(firstResult.previousPost?.id).isEqualTo(40L)
        assertThat(firstResult.nextPost?.id).isEqualTo(60L)
        org.mockito.Mockito
            .verify(postUseCase, org.mockito.Mockito.times(1))
            .findPublicDetailById(50L)
        org.mockito.Mockito
            .verify(postUseCase, org.mockito.Mockito.times(1))
            .findAdjacentPublicPosts(curPost.createdAt, 50L)

        // 2) 두 번째 조회: 캐시 히트 -> adjacent DB 조회 0회
        val cachedResult = service.getAdjacentPosts(50L)
        assertThat(cachedResult.previousPost?.id).isEqualTo(40L)
        assertThat(cachedResult.nextPost?.id).isEqualTo(60L)
        org.mockito.Mockito
            .verify(postUseCase, org.mockito.Mockito.times(1))
            .findPublicDetailById(50L)
        org.mockito.Mockito
            .verify(postUseCase, org.mockito.Mockito.times(1))
            .findAdjacentPublicPosts(curPost.createdAt, 50L)

        // 3) 글 수정/생성 이벤트 발생 -> 캐시 무효화
        given(postUseCase.findAdjacentPublicPosts(curPost.createdAt, 50L)).willReturn(prevPost2 to nextPost1)
        invalidator.invalidate(
            com.back.boundedContexts.post.application.service.PostReadCacheInvalidationRequest(
                postId = 45L,
                beforeTags = emptyList(),
                afterTags = emptyList(),
                scope = com.back.boundedContexts.post.application.service.PostReadCacheInvalidationScope.PublicPostCreated,
                evictReason = "create",
            ),
        )

        // 4) 무효화 후 조회: 최신 결과 반환 (이전 글이 45L로 갱신됨) 및 DB 1회 재호출 (총 2회)
        val invalidatedResult = service.getAdjacentPosts(50L)
        assertThat(invalidatedResult.previousPost?.id).isEqualTo(45L)
        assertThat(invalidatedResult.nextPost?.id).isEqualTo(60L)
        org.mockito.Mockito
            .verify(postUseCase, org.mockito.Mockito.times(2))
            .findAdjacentPublicPosts(curPost.createdAt, 50L)
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

    @Test
    @DisplayName("GET /post/api/v1/posts getItems는 query service 캐시와 weak ETag/304 응답을 사용한다")
    fun getItemsUsesCachedQueryAndWeakEtag() {
        val postDto = PostDto(createPost(id = 77L, listed = true))
        val pageDto = PageDto(PagedResult(content = listOf(postDto), page = 1, pageSize = 30, totalElements = 1L))
        given(postSearchIntentResolver.normalizeKeyword("")).willReturn("")
        given(postPublicReadQueryUseCase.getPublicItems(1, 30, "", PostSearchSortType1.CREATED_AT)).willReturn(pageDto)

        val response = MockHttpServletResponse()
        val firstEntity = controller.getItems(MockHttpServletRequest(), response, 1, 30, "", PostSearchSortType1.CREATED_AT)
        assertThat(firstEntity.statusCode.value()).isEqualTo(200)
        val etag = response.getHeader("ETag")
        assertThat(etag).startsWith("W/\"")
        assertThat(response.getHeader("Surrogate-Key")).contains(PostCacheTags.LIST, PostCacheTags.FEED)

        val notModifiedReq =
            MockHttpServletRequest().apply {
                addHeader("If-None-Match", etag!!)
            }
        val notModifiedRes = MockHttpServletResponse()
        val secondEntity = controller.getItems(notModifiedReq, notModifiedRes, 1, 30, "", PostSearchSortType1.CREATED_AT)
        assertThat(secondEntity.statusCode.value()).isEqualTo(304)

        val searchKw = "kotlin"
        given(postSearchIntentResolver.normalizeKeyword(searchKw)).willReturn(searchKw)
        given(postPublicReadQueryUseCase.getPublicItems(1, 30, searchKw, PostSearchSortType1.CREATED_AT)).willReturn(pageDto)
        val searchRes = MockHttpServletResponse()
        val searchEntity = controller.getItems(MockHttpServletRequest(), searchRes, 1, 30, searchKw, PostSearchSortType1.CREATED_AT)
        assertThat(searchEntity.statusCode.value()).isEqualTo(200)
        assertThat(searchRes.getHeader("Surrogate-Key")).contains(PostCacheTags.LIST, PostCacheTags.SEARCH)
        assertThat(searchRes.getHeader("Cache-Control")).contains("public")

        val noStoreKw = "this query exceeds twentyeight chars for no store"
        given(postSearchIntentResolver.normalizeKeyword(noStoreKw)).willReturn(noStoreKw)
        given(postPublicReadQueryUseCase.getPublicItems(1, 30, noStoreKw, PostSearchSortType1.CREATED_AT)).willReturn(pageDto)
        val noStoreRes = MockHttpServletResponse()
        val noStoreEntity = controller.getItems(MockHttpServletRequest(), noStoreRes, 1, 30, noStoreKw, PostSearchSortType1.CREATED_AT)
        assertThat(noStoreEntity.statusCode.value()).isEqualTo(200)
        assertThat(noStoreEntity.body).isEqualTo(pageDto)
        assertThat(noStoreRes.getHeader("Cache-Control")).contains("no-store")
        assertThat(noStoreRes.getHeader("Surrogate-Key")).contains(PostCacheTags.LIST, PostCacheTags.SEARCH)

        val defaultCatalog = PublicWikilinkCatalogResBody()
        assertThat(defaultCatalog.items).isEmpty()
        val defaultBacklinkItem =
            PublicPostBacklinkItemDto(
                id = 1L,
                title = "제목",
                createdAt = Instant.EPOCH,
                modifiedAt = Instant.EPOCH,
            )
        assertThat(defaultBacklinkItem.summary).isEmpty()
        val defaultBacklinks = PublicPostBacklinksResBody()
        assertThat(defaultBacklinks.items).isEmpty()
        val defaultRestoreReq = AdmPostRevisionRestoreRequest()
        assertThat(defaultRestoreReq.expectedVersion).isNull()
    }

    @Test
    @DisplayName("GET /post/api/v1/posts/wikilink-catalog는 weak ETag/304와 카탈로그 캐시 조회를 처리한다")
    fun wikilinkCatalogEndpointAndServiceWorkEndToEnd() {
        val now = Instant.parse("2026-08-09T12:00:00Z")
        val items =
            listOf(
                com.back.boundedContexts.post.dto.PublicWikilinkCatalogItemDto(
                    id = 11L,
                    title = "Kotlin Cache",
                    createdAt = now,
                ),
            )
        val catalogBody =
            com.back.boundedContexts.post.dto.PublicWikilinkCatalogResBody(
                items = items,
            )
        given(postPublicReadQueryUseCase.getPublicWikilinkCatalog()).willReturn(catalogBody)

        val response = MockHttpServletResponse()
        val entity = controller.getWikilinkCatalog(MockHttpServletRequest(), response)
        assertThat(entity.statusCode.value()).isEqualTo(200)
        assertThat(entity.body!!.items).hasSize(1)
        val etag = response.getHeader("ETag")
        assertThat(etag).startsWith("W/\"")
        assertThat(response.getHeader("Surrogate-Key")).contains(PostCacheTags.LIST, PostCacheTags.SITEMAP)

        val secondReq = MockHttpServletRequest().apply { addHeader("If-None-Match", etag!!) }
        val secondRes = MockHttpServletResponse()
        assertThat(controller.getWikilinkCatalog(secondReq, secondRes).statusCode.value()).isEqualTo(304)

        val cacheManager =
            org.springframework.cache.concurrent.ConcurrentMapCacheManager(
                PostQueryCacheNames.WIKILINK_CATALOG,
            )
        val service = createService(cacheManager)
        given(postUseCase.getPublicWikilinkCatalogItems(5_000)).willReturn(items)
        val loaded = service.getPublicWikilinkCatalog()
        assertThat(loaded.items.map { it.id }).containsExactly(11L)
    }

    @Test
    @DisplayName("백링크 서비스·컨트롤러는 위키링크 매칭, 요약 폴백, 캐시 적중, 음수 캐시 404, weak ETag/304를 처리한다")
    fun backlinksServiceAndControllerHandleMatchCacheNegativeAndEtag() {
        val now = Instant.parse("2026-08-09T12:00:00Z")
        val targetPost = createPost(id = 42L, listed = true)
        val backlinkRes =
            com.back.boundedContexts.post.dto.PublicPostBacklinksResBody(
                items =
                    listOf(
                        com.back.boundedContexts.post.dto.PublicPostBacklinkItemDto(
                            id = 100L,
                            title = "참조 글",
                            summary = "명시 요약",
                            createdAt = now,
                            modifiedAt = now,
                        ),
                    ),
            )
        given(postPublicReadQueryUseCase.getPublicBacklinks(42L)).willReturn(backlinkRes)

        val res = MockHttpServletResponse()
        val first = controller.getBacklinks(MockHttpServletRequest(), res, 42L)
        assertThat(first.statusCode.value()).isEqualTo(200)
        val etag = res.getHeader("ETag")
        assertThat(etag).startsWith("W/\"")
        assertThat(res.getHeader("Surrogate-Key")).contains(PostCacheTags.LIST, PostCacheTags.DETAIL, PostCacheTags.byPostId(42L))

        val req304 = MockHttpServletRequest().apply { addHeader("If-None-Match", etag!!) }
        assertThat(controller.getBacklinks(req304, MockHttpServletResponse(), 42L).statusCode.value()).isEqualTo(304)

        val cacheManager =
            org.springframework.cache.concurrent.ConcurrentMapCacheManager(
                PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE,
                PostQueryCacheNames.DETAIL_PUBLIC_META,
                PostQueryCacheNames.BACKLINKS,
            )
        val service = createService(cacheManager)
        given(postUseCase.isPublicDetailReadable(42L)).willReturn(true)
        given(postUseCase.findPublicDetailById(42L)).willReturn(targetPost)
        val candidates =
            (1L..25L).map { idx ->
                com.back.boundedContexts.post.dto.PublicBacklinkCandidateProjection(
                    id = 100L + idx,
                    title = "후보 $idx",
                    summaryText = if (idx == 1L) "직접 요약" else "",
                    content =
                        when {
                            idx == 1L -> "본문 [[글 42]]"
                            idx <= 21L -> "실제 백엔드 아키텍처와 캐시 무효화 설계를 다룹니다. [link](/posts/42)"
                            else -> "관련 없음"
                        },
                    createdAt = now,
                    modifiedAt = now,
                )
            }
        given(postUseCase.findPublicBacklinkCandidates(42L, 200)).willReturn(candidates)

        val computed = service.getPublicBacklinks(42L)
        assertThat(computed.items).hasSize(20)
        assertThat(computed.items.first().summary).isEqualTo("직접 요약")
        assertThat(computed.items[1].summary).isNotBlank()

        val cachedHit = service.getPublicBacklinks(42L)
        assertThat(cachedHit).isEqualTo(computed)
        org.mockito.Mockito
            .verify(postUseCase, org.mockito.Mockito.times(1))
            .findPublicBacklinkCandidates(42L, 200)

        given(postUseCase.isPublicDetailReadable(999L)).willReturn(false)
        assertThatThrownBy { service.getPublicBacklinks(999L) }
            .isInstanceOf(com.back.global.exception.application.AppException::class.java)
        assertThatThrownBy { service.getPublicBacklinks(999L) }
            .isInstanceOf(com.back.global.exception.application.AppException::class.java)
        org.mockito.Mockito
            .verify(postUseCase, org.mockito.Mockito.times(1))
            .isPublicDetailReadable(999L)
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
