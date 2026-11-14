package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.boundedContexts.post.model.Post
import com.back.standard.extensions.getOrThrow
import com.back.support.BaseControllerIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.web.servlet.post

@DisplayName("ApiV1AdmPostController 글 일괄 처리(벌크) 통합 테스트")
class ApiV1AdmPostControllerBulkIntegrationTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var postFacade: PostApplicationService

    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var entityManager: jakarta.persistence.EntityManager

    @Autowired
    private lateinit var postRepository: com.back.boundedContexts.post.application.port.output.PostRepositoryPort

    private fun adminActor(): Member = actorApplicationService.findByEmail("admin@test.com").getOrThrow()

    private fun createPost(
        title: String,
        published: Boolean = false,
        listed: Boolean = false,
    ): Post =
        postFacade.write(
            author = adminActor(),
            title = title,
            content = "본문: $title",
            published = published,
            listed = listed,
            summaryMode = com.back.boundedContexts.post.model.PostSummaryMode.AUTO,
        )

    @Test
    @WithUserDetails("admin@test.com")
    fun `DELETE 액션은 중복 ID를 distinct 처리하고 대상 글들을 soft delete한다`() {
        val p1 = createPost("벌크 삭제 1", published = true, listed = true)
        val p2 = createPost("벌크 삭제 2", published = true, listed = true)

        mvc
            .post("/post/api/v1/adm/posts/bulk") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "ids": [${p1.id}, ${p2.id}, ${p1.id}],
                        "action": "DELETE"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.data.processedCount") { value(2) }
                jsonPath("$.data.ids[0]") { value(p1.id) }
                jsonPath("$.data.ids[1]") { value(p2.id) }
            }

        entityManager.flush()
        entityManager.clear()
        val deleted1 = postRepository.findById(p1.id).orElse(null)
        val deleted2 = postRepository.findById(p2.id).orElse(null)
        assertThat(deleted1 == null || deleted1.deletedAt != null).isTrue()
        assertThat(deleted2 == null || deleted2.deletedAt != null).isTrue()
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `RESTORE 및 HARD_DELETE 액션은 삭제된 글을 정상 복구하거나 영구삭제한다`() {
        val p1 = createPost("복구 대상 1")
        val p2 = createPost("영구삭제 대상 2")
        postFacade.delete(p1, adminActor())
        postFacade.delete(p2, adminActor())

        // RESTORE
        mvc
            .post("/post/api/v1/adm/posts/bulk") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "ids": [${p1.id}],
                        "action": "RESTORE"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.data.processedCount") { value(1) }
                jsonPath("$.data.ids[0]") { value(p1.id) }
            }

        val restored = postFacade.findById(p1.id)
        assertThat(restored).isNotNull
        assertThat(restored?.deletedAt).isNull()

        // HARD_DELETE
        mvc
            .post("/post/api/v1/adm/posts/bulk") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "ids": [${p2.id}],
                        "action": "HARD_DELETE"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.data.processedCount") { value(1) }
                jsonPath("$.data.ids[0]") { value(p2.id) }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `PUBLISH_LISTED, PUBLISH_UNLISTED, UNPUBLISH_PRIVATE 액션 정상 동작 검증`() {
        val p1 = createPost("상태 변경 1", published = false, listed = false)

        // PUBLISH_LISTED
        mvc
            .post("/post/api/v1/adm/posts/bulk") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "ids": [${p1.id}],
                        "action": "PUBLISH_LISTED"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.processedCount") { value(1) }
            }
        val post1 = postFacade.findById(p1.id).getOrThrow()
        assertThat(post1.published).isTrue()
        assertThat(post1.listed).isTrue()

        // PUBLISH_UNLISTED
        mvc
            .post("/post/api/v1/adm/posts/bulk") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "ids": [${p1.id}],
                        "action": "PUBLISH_UNLISTED"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.processedCount") { value(1) }
            }
        val post2 = postFacade.findById(p1.id).getOrThrow()
        assertThat(post2.published).isTrue()
        assertThat(post2.listed).isFalse()

        // UNPUBLISH_PRIVATE
        mvc
            .post("/post/api/v1/adm/posts/bulk") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "ids": [${p1.id}],
                        "action": "UNPUBLISH_PRIVATE"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.processedCount") { value(1) }
            }
        val post3 = postFacade.findById(p1.id).getOrThrow()
        assertThat(post3.published).isFalse()
        assertThat(post3.listed).isFalse()
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `존재하지 않는 글 ID는 건너뛰고 존재하는 글만 처리한다`() {
        val p = createPost("존재 글")

        mvc
            .post("/post/api/v1/adm/posts/bulk") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "ids": [999999, ${p.id}],
                        "action": "DELETE"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.processedCount") { value(1) }
                jsonPath("$.data.ids[0]") { value(p.id) }
            }
    }
}
