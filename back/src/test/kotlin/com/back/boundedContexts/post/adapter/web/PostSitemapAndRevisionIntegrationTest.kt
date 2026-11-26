package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRevisionRepositoryPort
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.boundedContexts.post.application.service.PostQueryCacheNames
import com.back.boundedContexts.post.model.Post
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.global.task.application.TaskPayloadEnvelope
import com.back.global.task.model.Task
import com.back.standard.extensions.getOrThrow
import com.back.support.BaseControllerIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.cache.CacheManager
import org.springframework.http.HttpHeaders
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

@DisplayName("경량 Sitemap·게시글 리비전 원장·작업큐 SQL 제외 통합 테스트")
class PostSitemapAndRevisionIntegrationTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var postFacade: PostApplicationService

    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var postRepository: PostRepositoryPort

    @Autowired
    private lateinit var postRevisionRepository: PostRevisionRepositoryPort

    @Autowired
    private lateinit var taskRepository: TaskRepository

    @Autowired
    private lateinit var cacheManager: CacheManager

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    private fun adminActor(): Member = actorApplicationService.findByEmail("admin@test.com").getOrThrow()

    private fun writePost(
        title: String,
        content: String,
        published: Boolean = true,
        listed: Boolean = true,
        summary: String? = null,
        summaryMode: PostSummaryMode = PostSummaryMode.AUTO,
    ): Post =
        postFacade.write(
            author = adminActor(),
            title = title,
            content = content,
            published = published,
            listed = listed,
            summary = summary,
            summaryMode = summaryMode,
        )

    @Test
    fun `공개 Sitemap API는 공개·목록노출 정식 글만 본문 없이 id DESC로 반환하고 304 ETag를 지원한다`() {
        cacheManager.getCache(PostQueryCacheNames.SITEMAP)?.clear()

        val pub1 = writePost("사이트맵 공개글 1", "초기 본문 1", published = true, listed = true)
        val unpublished = writePost("미발행 글", "비공개 본문", published = false, listed = false)
        val unlisted = writePost("비목록 글", "언리스티드 본문", published = true, listed = false)
        val deleted = writePost("삭제될 글", "삭제 본문", published = true, listed = true)
        postFacade.delete(deleted, adminActor())
        val (tempDraft, _) = postFacade.getOrCreateTemp(adminActor())
        val pub2 = writePost("사이트맵 공개글 2", "초기 본문 2", published = true, listed = true)

        val defaultPortItems = postRepository.findPublicSitemapItems()
        val defaultIds = defaultPortItems.map { it.id }
        assertThat(defaultIds)
            .contains(pub2.id, pub1.id)
            .doesNotContain(unpublished.id, unlisted.id, deleted.id, tempDraft.id)
        assertThat(defaultIds).isSortedAccordingTo(Comparator.reverseOrder())

        val topOne = postRepository.findPublicSitemapItems(1)
        assertThat(topOne).hasSize(1)
        assertThat(topOne.first().id).isEqualTo(pub2.id)

        val mvcResult =
            mvc
                .get("/post/api/v1/posts/sitemap?limit=50")
                .andExpect {
                    status { isOk() }
                }.andReturn()

        val responseJson = mvcResult.response.contentAsString
        val tree = objectMapper.readTree(responseJson)
        val itemsNode = tree.path("items")
        assertThat(itemsNode.isArray).isTrue()
        val itemNodes = itemsNode.values().toList()
        val returnedIds = itemNodes.map { it.path("id").asLong() }
        assertThat(returnedIds)
            .contains(pub2.id, pub1.id)
            .doesNotContain(unpublished.id, unlisted.id, deleted.id, tempDraft.id)
        assertThat(returnedIds).isSortedAccordingTo(Comparator.reverseOrder())
        val firstItem = itemNodes.first()
        assertThat(firstItem.has("id")).isTrue()
        assertThat(firstItem.has("createdAt")).isTrue()
        assertThat(firstItem.has("modifiedAt")).isTrue()
        assertThat(firstItem.has("content")).isFalse()
        assertThat(firstItem.has("contentHtml")).isFalse()

        val etag = mvcResult.response.getHeader(HttpHeaders.ETAG)
        assertThat(etag).isNotBlank()

        mvc
            .get("/post/api/v1/posts/sitemap?limit=50") {
                header(HttpHeaders.IF_NONE_MATCH, etag!!)
            }.andExpect {
                status { isNotModified() }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `리비전 원장은 정식 저장 시 20건 상한을 유지하고 임시초안은 제외하며 복원과 영구삭제 정리를 수행한다`() {
        val admin = adminActor()
        val post =
            writePost(
                title = "리비전 v1",
                content = "리비전 본문 v1",
                summary = "수동 요약 v1",
                summaryMode = PostSummaryMode.MANUAL,
            )

        // 24회 정식 수정 -> 최초 1회 + 24회 = 총 25회 생성 후 최신 20건만 보존되어야 한다.
        repeat(24) { idx ->
            val step = idx + 2
            val current = postRepository.findById(post.id).orElseThrow()
            postFacade.modify(
                actor = admin,
                post = current,
                title = "리비전 v$step",
                content = "리비전 본문 v$step",
                published = true,
                listed = true,
                expectedVersion = current.version ?: 0L,
                summary = if (step % 2 == 0) "요약 v$step" else null,
                summaryMode = if (step % 2 == 0) PostSummaryMode.MANUAL else PostSummaryMode.AUTO,
            )
        }

        // 임시초안 자동저장은 리비전 원장에 기록되지 않아야 한다.
        val (tempDraft, _) = postFacade.getOrCreateTemp(admin)
        postFacade.saveTempDraft(
            actor = admin,
            postId = tempDraft.id,
            request =
                com.back.boundedContexts.post.dto.PostTempDraftSaveRequest(
                    title = "임시초안 제목",
                    content = "임시초안 본문",
                ),
        )
        assertThat(postRevisionRepository.findSummariesByPostId(tempDraft.id, 20)).isEmpty()

        val listResult =
            mvc
                .get("/post/api/v1/adm/posts/${post.id}/revisions")
                .andExpect {
                    status { isOk() }
                }.andReturn()
        val revisionArray = objectMapper.readTree(listResult.response.contentAsString)
        val revisionNodes = revisionArray.values().toList()
        assertThat(revisionNodes).hasSize(20)
        assertThat(revisionNodes.first().path("title").asString()).isEqualTo("리비전 v25")
        assertThat(revisionNodes.last().path("title").asString()).isEqualTo("리비전 v6")

        val restoreTarget = revisionNodes[3]
        val restoreRevisionId = restoreTarget.path("id").asLong()
        val restoreTargetTitle = restoreTarget.path("title").asString()
        assertThat(restoreTargetTitle).isEqualTo("리비전 v22")

        // summaryText가 null인 리비전 복원 경로 + 일반 리비전 복원 경로를 모두 검증한다.
        val nullSummaryRevisionId =
            postRevisionRepository.appendAndTrimRevisions(
                postId = post.id,
                authorId = admin.id,
                title = "요약없음 v0",
                content = "",
                summaryText = null,
                maxRevisionsPerPost = 20,
            )!!

        mvc
            .post("/post/api/v1/adm/posts/${post.id}/revisions/$nullSummaryRevisionId/restore")
            .andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.data.title") { value("요약없음 v0") }
                jsonPath("$.data.summary") { value("") }
            }

        mvc
            .post("/post/api/v1/adm/posts/${post.id}/revisions/$restoreRevisionId/restore")
            .andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.data.title") { value("리비전 v22") }
                jsonPath("$.data.content") { value("리비전 본문 v22") }
                jsonPath("$.data.summary") { value("요약 v22") }
            }

        // 존재하지 않는 글 또는 리비전 ID는 404 반환.
        mvc
            .get("/post/api/v1/adm/posts/99999999/revisions")
            .andExpect {
                status { isNotFound() }
            }
        mvc
            .post("/post/api/v1/adm/posts/${post.id}/revisions/99999999/restore")
            .andExpect {
                status { isNotFound() }
            }

        // soft delete 후 영구삭제 시 post_revision 데이터도 정리된다.
        val reload = postRepository.findById(post.id).orElseThrow()
        postFacade.delete(reload, admin)
        postFacade.hardDeleteDeletedByIdForAdmin(post.id)
        assertThat(postRevisionRepository.findSummariesByPostId(post.id, 20)).isEmpty()
    }

    @Test
    fun `TaskRepository findPendingTasksExcludingTypesWithLock은 PostgreSQL에서 포화 타입을 제외하고 잠금 조회한다`() {
        fun validEnvelopePayload(
            uid: UUID,
            aggregateId: Long,
            taskType: String,
        ): String =
            objectMapper.writeValueAsString(
                TaskPayloadEnvelope(
                    schemaVersion = 2,
                    taskType = taskType,
                    sensitivity = TaskPayloadSensitivity.INTERNAL,
                    createdAtEpochMs = 1_763_480_000_000L,
                    expiresAtEpochMs = null,
                    payloadJson = """{"uid":"$uid","aggregateType":"Post","aggregateId":$aggregateId}""",
                ),
            )

        val heavy1Uid = UUID.randomUUID()
        val heavy1 =
            taskRepository.saveAndFlush(
                Task(
                    uid = heavy1Uid,
                    aggregateType = "Post",
                    aggregateId = 1L,
                    taskType = "queue.test.heavy",
                    payload = validEnvelopePayload(heavy1Uid, 1L, "queue.test.heavy"),
                    maxRetries = 3,
                ).apply {
                    nextRetryAt = Instant.parse("2020-01-01T00:00:00Z")
                },
            )
        val heavy2Uid = UUID.randomUUID()
        val heavy2 =
            taskRepository.saveAndFlush(
                Task(
                    uid = heavy2Uid,
                    aggregateType = "Post",
                    aggregateId = 2L,
                    taskType = "queue.test.heavy",
                    payload = validEnvelopePayload(heavy2Uid, 2L, "queue.test.heavy"),
                    maxRetries = 3,
                ).apply {
                    nextRetryAt = Instant.parse("2020-01-01T00:00:00Z")
                },
            )
        val lightUid = UUID.randomUUID()
        val light =
            taskRepository.saveAndFlush(
                Task(
                    uid = lightUid,
                    aggregateType = "Post",
                    aggregateId = 3L,
                    taskType = "queue.test.light",
                    payload = validEnvelopePayload(lightUid, 3L, "queue.test.light"),
                    maxRetries = 3,
                ).apply {
                    nextRetryAt = Instant.parse("2020-01-01T00:00:01Z")
                },
            )

        val selected = taskRepository.findPendingTasksExcludingTypesWithLock(listOf("queue.test.heavy"), 2)
        val selectedIds = selected.map { it.id }
        assertThat(selectedIds)
            .contains(light.id)
            .doesNotContain(heavy1.id, heavy2.id)
    }
}
