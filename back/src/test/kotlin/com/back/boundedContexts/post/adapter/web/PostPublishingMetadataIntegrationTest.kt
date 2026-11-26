package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.input.PostScheduledPublishUseCase
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.boundedContexts.post.application.service.PostQueryCacheNames
import com.back.boundedContexts.post.model.Post
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.standard.extensions.getOrThrow
import com.back.support.BaseControllerIntegrationTest
import com.jayway.jsonpath.JsonPath
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.cache.CacheManager
import org.springframework.http.MediaType
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.Instant
import java.time.temporal.ChronoUnit

@DisplayName("예약 발행·연재 시리즈·정본 URL·다중 임시초안 통합 테스트")
class PostPublishingMetadataIntegrationTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var postFacade: PostApplicationService

    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var scheduledPublishUseCase: PostScheduledPublishUseCase

    @Autowired
    private lateinit var cacheManager: CacheManager

    private fun adminActor(): Member = actorApplicationService.findByEmail("admin@test.com").getOrThrow()

    @Test
    @WithUserDetails("admin@test.com")
    fun `출판 메타데이터 작성·수정·정본 URL·시리즈 네비게이션 및 304 ETag가 동작한다`() {
        val series = "  Compiler   Architecture  "
        val firstRes =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "1부 렉서 설계",
                          "content": "렉서 상태 머신 설계 본문입니다.",
                          "summaryMode": "AUTO",
                          "published": true,
                          "listed": true,
                          "seriesName": "$series",
                          "seriesOrder": 1,
                          "canonicalUrl": "https://origin.example.com/posts/lexer"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isCreated() }
                    jsonPath("$.data.seriesName") { value("Compiler Architecture") }
                    jsonPath("$.data.seriesOrder") { value(1) }
                    jsonPath("$.data.canonicalUrl") { value("https://origin.example.com/posts/lexer") }
                }.andReturn()
        val firstId = JsonPath.read<Int>(firstRes.response.contentAsString, "$.data.id").toLong()

        val secondRes =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "2부 파서 구현",
                          "content": "Pratt 파서 구현 본문입니다.",
                          "summaryMode": "AUTO",
                          "published": true,
                          "listed": true,
                          "seriesName": "Compiler Architecture",
                          "seriesOrder": 2
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isCreated() }
                }.andReturn()
        val secondId = JsonPath.read<Int>(secondRes.response.contentAsString, "$.data.id").toLong()

        // 비목록(unlisted) 및 미발행 글은 공개 시리즈 목록에서 제외
        postFacade.write(
            author = adminActor(),
            title = "비목록 번외편",
            content = "비목록 본문",
            published = true,
            listed = false,
            summaryMode = PostSummaryMode.AUTO,
            seriesName = "Compiler Architecture",
            seriesOrder = 99,
        )

        val seriesRes =
            mvc
                .get("/post/api/v1/posts/$firstId/series")
                .andExpect {
                    status { isOk() }
                    header { string("ETag", startsWith("W/\"")) }
                    jsonPath("$.seriesName") { value("Compiler Architecture") }
                    jsonPath("$.items.length()") { value(2) }
                    jsonPath("$.items[0].id") { value(firstId) }
                    jsonPath("$.items[0].seriesOrder") { value(1) }
                    jsonPath("$.items[1].id") { value(secondId) }
                    jsonPath("$.items[1].seriesOrder") { value(2) }
                }.andReturn()

        val etag = seriesRes.response.getHeader("ETag")!!
        mvc
            .get("/post/api/v1/posts/$firstId/series") {
                header("If-None-Match", etag)
            }.andExpect {
                status { isNotModified() }
            }

        mvc
            .get("/post/api/v1/adm/posts/series")
            .andExpect {
                status { isOk() }
                jsonPath("$[0]") { exists() }
            }

        // 수정 시 시리즈 제거 및 정본 URL 갱신
        val createdVersion = postFacade.findById(secondId).getOrThrow().version ?: 0L
        mvc
            .put("/post/api/v1/posts/$secondId") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "2부 파서 구현(개정)",
                      "content": "개정 본문입니다.",
                      "published": true,
                      "listed": true,
                      "version": $createdVersion,
                      "seriesName": null,
                      "canonicalUrl": "https://mirror.example.com/posts/parser-v2"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.seriesName") { value(null as String?) }
                jsonPath("$.data.seriesOrder") { value(null as Int?) }
                jsonPath("$.data.canonicalUrl") { value("https://mirror.example.com/posts/parser-v2") }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `본문·요약 상한 초과 및 위험한 정본 URL과 모순된 예약 발행 입력은 Fail-Closed 400 거부된다`() {
        val oversizedSummary = "s".repeat(301)
        mvc
            .post("/post/api/v1/posts") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "상한 초과 테스트",
                      "content": "정상 본문",
                      "summary": "$oversizedSummary",
                      "summaryMode": "MANUAL",
                      "published": false,
                      "listed": false
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
            }

        mvc
            .post("/post/api/v1/posts") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "잘못된 정본 URL",
                      "content": "본문",
                      "published": true,
                      "listed": true,
                      "canonicalUrl": "javascript:alert(1)"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
            }

        val futureAt = Instant.now().plus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS)
        mvc
            .post("/post/api/v1/posts") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "즉시발행 예약 충돌",
                      "content": "본문",
                      "published": true,
                      "listed": true,
                      "scheduledAt": "$futureAt"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `관리자 다중 임시초안 생성·조회·삭제와 예약 발행 자동 승격이 동작한다`() {
        val d1Res =
            mvc
                .post("/post/api/v1/adm/posts/temp")
                .andExpect {
                    status { isCreated() }
                    jsonPath("$.data.tempDraft") { value(true) }
                }.andReturn()
        val d1Id = JsonPath.read<Int>(d1Res.response.contentAsString, "$.data.id").toLong()

        val d2Res =
            mvc
                .post("/post/api/v1/adm/posts/temp")
                .andExpect {
                    status { isCreated() }
                    jsonPath("$.data.tempDraft") { value(true) }
                }.andReturn()
        val d2Id = JsonPath.read<Int>(d2Res.response.contentAsString, "$.data.id").toLong()
        assertThat(d2Id).isNotEqualTo(d1Id)

        mvc
            .get("/post/api/v1/adm/posts/temp")
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(org.hamcrest.Matchers.greaterThanOrEqualTo(2)) }
            }

        mvc
            .delete("/post/api/v1/adm/posts/temp/$d1Id")
            .andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
            }

        val dueFuture = Instant.now().plus(2, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS)
        // 미승격 임시초안(isTempDraft=true)에 예약 시각이 저장되더라도 확정 승격 전에는 자동 발행되지 않는다
        mvc
            .put("/post/api/v1/posts/temp/$d2Id") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "미확정 임시초안 예약 테스트",
                      "content": "자동 발행되면 안 되는 미승격 임시초안 본문입니다.",
                      "version": 0,
                      "scheduledAt": "$dueFuture"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.id") { value(d2Id) }
                jsonPath("$.data.scheduledAt") { exists() }
            }

        val scheduledRes =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "예약 자동 발행 글",
                          "content": "예약 시각 도래 시 자동 공개되는 본문입니다.",
                          "summaryMode": "AUTO",
                          "published": false,
                          "listed": true,
                          "scheduledAt": "$dueFuture",
                          "seriesName": "Schedule Series",
                          "seriesOrder": 1
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isCreated() }
                    jsonPath("$.data.published") { value(false) }
                    jsonPath("$.data.listed") { value(true) }
                }.andReturn()
        val scheduledId = JsonPath.read<Int>(scheduledRes.response.contentAsString, "$.data.id").toLong()

        val unlistedScheduledRes =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "비목록 예약 글",
                          "content": "비목록 공개 설정이 보존되는지 검증합니다.",
                          "summaryMode": "AUTO",
                          "published": false,
                          "listed": false,
                          "scheduledAt": "$dueFuture"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isCreated() }
                }.andReturn()
        val unlistedScheduledId = JsonPath.read<Int>(unlistedScheduledRes.response.contentAsString, "$.data.id").toLong()

        mvc.get("/post/api/v1/posts/$scheduledId").andExpect {
            status { isNotFound() }
        }

        val publishedCount = scheduledPublishUseCase.publishDueScheduledPosts(now = dueFuture.plusSeconds(10), batchSize = 50)
        assertThat(publishedCount).isEqualTo(2)

        val unpromotedTempDraft: Post = postFacade.findById(d2Id).getOrThrow()
        assertThat(unpromotedTempDraft.isTempDraft).isTrue()
        assertThat(unpromotedTempDraft.published).isFalse()

        val promotedUnlisted: Post = postFacade.findById(unlistedScheduledId).getOrThrow()
        assertThat(promotedUnlisted.published).isTrue()
        assertThat(promotedUnlisted.listed).isFalse()

        val promoted: Post = postFacade.findById(scheduledId).getOrThrow()
        assertThat(promoted.published).isTrue()
        assertThat(promoted.listed).isTrue()
        assertThat(promoted.scheduledAt).isNull()
        // BaseControllerIntegrationTest의 외부 테스트 트랜잭션은 롤백 전용이라 afterCommit 캐시 무효화가 커밋 전 미실행이므로 음수 캐시 검증 후 비운다
        assertThat(cacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE)?.get(scheduledId)?.get()).isEqualTo(true)
        cacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE)?.evict(scheduledId)

        mvc.get("/post/api/v1/posts/$scheduledId").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(scheduledId) }
        }
        mvc.get("/post/api/v1/posts/$scheduledId/series").andExpect {
            status { isOk() }
            jsonPath("$.seriesName") { value("Schedule Series") }
            jsonPath("$.items[0].id") { value(scheduledId) }
        }
    }
}
