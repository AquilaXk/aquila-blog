package com.back.boundedContexts.post.adapter.web

import com.back.global.revalidate.dto.PurgePostReadCachesPayload
import com.back.global.task.annotation.Task
import com.back.support.BaseCdnPurgeEnabledControllerIntegrationTest
import com.jayway.jsonpath.JsonPath
import jakarta.persistence.EntityManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.web.servlet.post
import tools.jackson.databind.ObjectMapper

@org.junit.jupiter.api.DisplayName("CDN purge 활성 상태의 canonical summary backfill 테스트")
class PostSummaryBackfillCdnPurgeIntegrationTest : BaseCdnPurgeEnabledControllerIntegrationTest() {
    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @Autowired
    private lateinit var entityManager: EntityManager

    @Test
    @WithUserDetails("admin@test.com")
    fun `public backfill enqueues a cdn purge task with public tags`() {
        val created =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "공개 이전 글",
                          "content": "---\nsummary: \"이전 요약\"\ntags: [cache]\n---\n공개 본문입니다.",
                          "published": true,
                          "listed": true
                        }
                        """.trimIndent()
                }.andReturn()
                .response.contentAsString
        val postId = JsonPath.read<Int>(created, "$.data.id").toLong()
        jdbcTemplate.update(
            """
            UPDATE post
            SET summary_text = NULL,
                summary_source = 'NONE',
                summary_content_hash = NULL,
                summary_algorithm_version = NULL,
                summary_generated_at = NULL
            WHERE id = ?
            """.trimIndent(),
            postId,
        )
        entityManager.flush()
        val purgeTasksBeforeBackfill = countCdnPurgeTasks(postId)

        mvc
            .post("/post/api/v1/adm/posts/summary-backfill") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"afterId":${postId - 1},"limit":1,"dryRun":false}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.updated") { value(1) }
            }

        entityManager.flush()
        assertThat(countCdnPurgeTasks(postId)).isEqualTo(purgeTasksBeforeBackfill + 1)

        val payload = latestCdnPurgeTaskPayload(postId)
        assertThat(payload.postId).isEqualTo(postId)
        assertThat(payload.beforeTags).containsExactly("cache")
        assertThat(payload.afterTags).containsExactly("cache")
    }

    private fun countCdnPurgeTasks(postId: Long): Long =
        jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM task WHERE task_type = ? AND aggregate_id = ?",
            Long::class.java,
            cdnPurgeTaskType,
            postId,
        )!!

    private fun latestCdnPurgeTaskPayload(postId: Long): PurgePostReadCachesPayload {
        val payloadJson =
            jdbcTemplate.queryForObject(
                """
                SELECT payload
                FROM task
                WHERE task_type = ?
                  AND aggregate_id = ?
                ORDER BY id DESC
                LIMIT 1
                """.trimIndent(),
                String::class.java,
                cdnPurgeTaskType,
                postId,
            )
        return objectMapper.readValue(payloadJson, PurgePostReadCachesPayload::class.java)
    }

    private val cdnPurgeTaskType: String
        get() = PurgePostReadCachesPayload::class.java.getAnnotation(Task::class.java).type
}
