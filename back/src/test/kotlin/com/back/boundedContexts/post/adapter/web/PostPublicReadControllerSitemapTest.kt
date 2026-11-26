package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.adapter.persistence.PostRevisionJdbcRepository
import com.back.boundedContexts.post.application.port.input.PostPublicReadQueryUseCase
import com.back.boundedContexts.post.application.support.PostCacheTags
import com.back.boundedContexts.post.dto.PublicSitemapPostItemDto
import com.back.boundedContexts.post.dto.PublicSitemapPostsResBody
import com.back.global.app.AppConfig
import com.back.standard.util.Ut
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.time.Instant

@DisplayName("공개 Sitemap API 및 리비전 저장소 가드 단위 테스트")
class PostPublicReadControllerSitemapTest {
    companion object {
        @JvmStatic
        @BeforeAll
        fun setup() {
            Ut.JSON.objectMapper = jacksonObjectMapper()
            AppConfig(
                siteBackUrl = "https://api.example.com",
                siteFrontUrl = "https://example.com",
            )
        }
    }

    private val postPublicReadQueryUseCase = mock(PostPublicReadQueryUseCase::class.java)
    private val postPublicReadResponseFactory = PostPublicReadResponseFactory()
    private val postSearchIntentResolver = mock(PostSearchIntentResolver::class.java)

    private val controller =
        ApiV1PostPublicReadController(
            postPublicReadQueryUseCase = postPublicReadQueryUseCase,
            postPublicReadResponseFactory = postPublicReadResponseFactory,
            postSearchIntentResolver = postSearchIntentResolver,
        )

    @Test
    @DisplayName("controller getSitemap은 limit를 1..10_000으로 보정하고 캐시 헤더와 304 ETag를 반환한다")
    fun controllerGetSitemapClampsLimitAndHandlesEtag304() {
        val createdAt = Instant.parse("2026-11-18T00:00:00Z")
        val modifiedAt = Instant.parse("2026-11-18T01:00:00Z")
        val body =
            PublicSitemapPostsResBody(
                items =
                    listOf(
                        PublicSitemapPostItemDto(id = 12L, createdAt = createdAt, modifiedAt = modifiedAt),
                        PublicSitemapPostItemDto(id = 11L, createdAt = createdAt, modifiedAt = modifiedAt),
                    ),
            )
        given(postPublicReadQueryUseCase.getPublicSitemap(1)).willReturn(body)
        given(postPublicReadQueryUseCase.getPublicSitemap(10_000)).willReturn(body)

        val minReq = MockHttpServletRequest()
        val minRes = MockHttpServletResponse()
        val minEntity = controller.getSitemap(minReq, minRes, limit = 0)
        assertThat(minEntity.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(minEntity.body).isEqualTo(body)
        assertThat(minRes.getHeader(HttpHeaders.CACHE_CONTROL))
            .isEqualTo("public, max-age=60, s-maxage=300, stale-while-revalidate=300, stale-if-error=600")
        assertThat(minRes.getHeader("Surrogate-Key"))
            .contains(PostCacheTags.LIST, PostCacheTags.SITEMAP)
        val etag = minRes.getHeader(HttpHeaders.ETAG)
        assertThat(etag).isNotNull().startsWith("W/\"").endsWith("\"")
        verify(postPublicReadQueryUseCase).getPublicSitemap(1)

        val maxReq =
            MockHttpServletRequest().apply {
                val maxEtag = postPublicReadResponseFactory.buildSitemapWeakEtag(10_000, body)
                addHeader(HttpHeaders.IF_NONE_MATCH, maxEtag)
            }
        val maxRes = MockHttpServletResponse()
        val notModifiedEntity = controller.getSitemap(maxReq, maxRes, limit = 99_999)
        assertThat(notModifiedEntity.statusCode).isEqualTo(HttpStatus.NOT_MODIFIED)
        verify(postPublicReadQueryUseCase).getPublicSitemap(10_000)
    }

    @Test
    @DisplayName("PostRevisionJdbcRepository는 유효하지 않은 양수 ID가 아니면 DB를 호출하지 않고 안전하게 반환한다")
    fun revisionJdbcRepositoryFailsClosedOnNonPositiveIds() {
        val jdbcTemplate = mock(JdbcTemplate::class.java)
        val repo = PostRevisionJdbcRepository(jdbcTemplate)

        assertThat(repo.appendAndTrimRevisions(0L, 1L, "t", "c", null, 20)).isNull()
        assertThat(repo.appendAndTrimRevisions(1L, 0L, "t", "c", "s", 20)).isNull()
        assertThat(repo.findSummariesByPostId(0L, 20)).isEmpty()
        assertThat(repo.findByPostIdAndRevisionId(0L, 1L)).isNull()
        assertThat(repo.findByPostIdAndRevisionId(1L, 0L)).isNull()
        repo.deleteByPostId(0L)

        verifyNoInteractions(jdbcTemplate)
    }
}
