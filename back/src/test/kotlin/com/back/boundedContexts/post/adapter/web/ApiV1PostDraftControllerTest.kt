package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.standard.extensions.getOrThrow
import com.back.support.BaseControllerIntegrationTest
import com.jayway.jsonpath.JsonPath
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

@DisplayName("ApiV1PostDraftController 임시초안 API 통합 테스트")
class ApiV1PostDraftControllerTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var postFacade: PostApplicationService

    @Test
    fun `비인증 사용자는 임시초안을 조회할 수 없다`() {
        mvc.get("/post/api/v1/posts/temp").andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `임시글이 없는 경우 200-2 응답과 null 데이터를 반환한다`() {
        mvc.get("/post/api/v1/posts/temp").andExpect {
            status { isOk() }
            jsonPath("$.resultCode") { value("200-2") }
            jsonPath("$.msg") { value("임시저장 글이 없습니다.") }
            jsonPath("$.data") { doesNotExist() }
        }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `임시초안 생성 후 단건 조회 시 기존 임시저장 글을 반환한다`() {
        val createRes =
            mvc
                .post("/post/api/v1/posts/temp")
                .andExpect {
                    status { isCreated() }
                    jsonPath("$.resultCode") { value("201-1") }
                }.andReturn()
                .response.contentAsString

        val tempId = JsonPath.read<Int>(createRes, "$.data.id").toLong()

        mvc.get("/post/api/v1/posts/temp").andExpect {
            status { isOk() }
            jsonPath("$.resultCode") { value("200-1") }
            jsonPath("$.msg") { value("기존 임시저장 글을 불러옵니다.") }
            jsonPath("$.data.id") { value(tempId) }
        }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `임시초안 자동저장은 빈 문자열 제목과 본문을 허용하며 비승격 상태를 유지한다`() {
        val createRes =
            mvc
                .post("/post/api/v1/posts/temp")
                .andReturn()
                .response.contentAsString
        val tempId = JsonPath.read<Int>(createRes, "$.data.id").toLong()
        val initialPost = postFacade.findById(tempId).getOrThrow()
        val currentVersion = initialPost.version ?: 0L

        mvc
            .put("/post/api/v1/posts/temp/$tempId") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "title": "",
                        "content": "",
                        "version": $currentVersion
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("임시저장 글이 저장되었습니다.") }
                jsonPath("$.data.id") { value(tempId) }
                jsonPath("$.data.title") { value("") }
                jsonPath("$.data.published") { value(false) }
                jsonPath("$.data.listed") { value(false) }
            }

        val updatedPost = postFacade.findById(tempId).getOrThrow()
        assertThat(updatedPost.title).isEqualTo("")
        assertThat(updatedPost.content).isEqualTo("")
        assertThat(updatedPost.isTempDraft).isTrue()
        assertThat(updatedPost.published).isFalse()
        assertThat(updatedPost.listed).isFalse()
        assertThat(postFacade.isTempDraft(updatedPost)).isTrue()
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `임시초안 자동저장 시 500_000자 초과 본문은 400 거부된다 (Fail-Closed)`() {
        val createRes =
            mvc
                .post("/post/api/v1/posts/temp")
                .andReturn()
                .response.contentAsString
        val tempId = JsonPath.read<Int>(createRes, "$.data.id").toLong()

        val oversizedContent = "a".repeat(500_001)
        mvc
            .put("/post/api/v1/posts/temp/$tempId") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "title": "정상 제목",
                        "content": "$oversizedContent"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `임시초안 자동저장 시 낙관적 락 버전 불일치는 409 거부된다`() {
        val createRes =
            mvc
                .post("/post/api/v1/posts/temp")
                .andReturn()
                .response.contentAsString
        val tempId = JsonPath.read<Int>(createRes, "$.data.id").toLong()

        mvc
            .put("/post/api/v1/posts/temp/$tempId") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "title": "충돌 제목",
                        "content": "충돌 본문",
                        "version": 999999
                    }
                    """.trimIndent()
            }.andExpect {
                status { isConflict() }
                jsonPath("$.resultCode") { value(com.back.global.exception.application.ErrorCode.POST_CONCURRENT_EDIT.code) }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `존재하지 않는 글의 임시초안 자동저장은 404 거부된다`() {
        mvc
            .put("/post/api/v1/posts/temp/999999") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "title": "없는 글",
                        "content": "내용"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isNotFound() }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `이미 발행된 일반 글에 임시초안 자동저장 요청 시 400 거부되며 공개 상태가 보존된다`() {
        val actor =
            mvc
                .post("/post/api/v1/posts/temp")
                .andReturn()
        assertThat(actor.response.status).isIn(200, 201)
        val tempId = JsonPath.read<Int>(actor.response.contentAsString, "$.data.id").toLong()
        val tempPost = postFacade.findById(tempId).getOrThrow()
        val publishedPost =
            postFacade.write(
                author = tempPost.author,
                title = "발행된 공개 글",
                content = "발행 본문",
                published = true,
                listed = true,
                summaryMode = com.back.boundedContexts.post.model.PostSummaryMode.AUTO,
            )

        mvc
            .put("/post/api/v1/posts/temp/${publishedPost.id}") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "title": "강등 시도",
                        "content": "강등 본문",
                        "version": ${publishedPost.version ?: 0L}
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
            }

        val reloaded = postFacade.findById(publishedPost.id).getOrThrow()
        assertThat(reloaded.published).isTrue()
        assertThat(reloaded.listed).isTrue()
        assertThat(reloaded.isTempDraft).isFalse()
        assertThat(reloaded.title).isEqualTo("발행된 공개 글")
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `findAdjacentPublicPosts는 인접 글이 없을 때와 있을 때 모두 정상 하이드레이션한다`() {
        val createRes =
            mvc
                .post("/post/api/v1/posts/temp")
                .andReturn()
                .response.contentAsString
        val author = postFacade.findById(JsonPath.read<Int>(createRes, "$.data.id").toLong()).getOrThrow().author

        val farFuture = java.time.Instant.parse("2099-01-01T00:00:00Z")
        val p1 =
            postFacade.write(
                author = author,
                title = "인접 1",
                content = "본문 1",
                published = true,
                listed = true,
                summaryMode = com.back.boundedContexts.post.model.PostSummaryMode.AUTO,
            )
        val p2 =
            postFacade.write(
                author = author,
                title = "인접 2",
                content = "본문 2",
                published = true,
                listed = true,
                summaryMode = com.back.boundedContexts.post.model.PostSummaryMode.AUTO,
            )
        val p3 =
            postFacade.write(
                author = author,
                title = "인접 3",
                content = "본문 3",
                published = true,
                listed = true,
                summaryMode = com.back.boundedContexts.post.model.PostSummaryMode.AUTO,
            )

        val midAdjacent = postFacade.findAdjacentPublicPosts(p2.createdAt, p2.id)
        assertThat(midAdjacent.first?.id).isEqualTo(p1.id)
        assertThat(midAdjacent.second?.id).isEqualTo(p3.id)

        val afterAll = postFacade.findAdjacentPublicPosts(farFuture, Long.MAX_VALUE)
        assertThat(afterAll.second).isNull()

        val isolatedEmpty =
            postFacade.findAdjacentPublicPosts(
                java.time.Instant.parse("1970-01-01T00:00:00Z"),
                0L,
            )
        assertThat(isolatedEmpty.first).isNull()
    }

    @Test
    fun `PostTempDraftSaveRequest 기본 생성자 및 프로퍼티 커버리지`() {
        val defaultReq =
            com.back.boundedContexts.post.dto
                .PostTempDraftSaveRequest()
        assertThat(defaultReq.title).isEqualTo("")
        assertThat(defaultReq.content).isEqualTo("")
        assertThat(defaultReq.version).isNull()
        assertThat(defaultReq.summary).isNull()
        assertThat(defaultReq.summaryMode).isNull()
        assertThat(defaultReq.thumbnail).isNull()

        val fullReq =
            com.back.boundedContexts.post.dto.PostTempDraftSaveRequest(
                title = "제목",
                content = "본문",
                version = 1L,
                summary = "요약",
                summaryMode = com.back.boundedContexts.post.model.PostSummaryMode.AUTO,
                thumbnail = "https://example.com/thumb.jpg",
            )
        assertThat(fullReq.title).isEqualTo("제목")
        assertThat(fullReq.content).isEqualTo("본문")
        assertThat(fullReq.version).isEqualTo(1L)
        assertThat(fullReq.summary).isEqualTo("요약")
        assertThat(fullReq.summaryMode).isEqualTo(com.back.boundedContexts.post.model.PostSummaryMode.AUTO)
        assertThat(fullReq.thumbnail).isEqualTo("https://example.com/thumb.jpg")
    }
}
