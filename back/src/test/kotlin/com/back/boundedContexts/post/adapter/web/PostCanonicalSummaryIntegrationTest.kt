package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.service.PostQueryCacheNames
import com.back.boundedContexts.post.application.service.PostReadCacheInvalidationTarget
import com.back.boundedContexts.post.application.service.PostSummaryResolver
import com.back.boundedContexts.post.application.service.PostWriteSideEffectPayload
import com.back.global.task.application.TaskFacade
import com.back.support.BaseControllerIntegrationTest
import com.jayway.jsonpath.JsonPath
import jakarta.persistence.EntityManager
import org.assertj.core.api.Assertions.assertThat
import org.hibernate.Session
import org.junit.jupiter.api.RepeatedTest
import org.junit.jupiter.api.RepetitionInfo
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.data.redis.connection.RedisConnectionFactory
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import tools.jackson.databind.ObjectMapper
import java.nio.charset.StandardCharsets
import java.sql.Timestamp
import java.time.Instant

@org.junit.jupiter.api.DisplayName("게시글 canonical summary 통합 테스트")
class PostCanonicalSummaryIntegrationTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    private lateinit var taskFacade: TaskFacade

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @Autowired
    private lateinit var entityManager: EntityManager

    @Autowired
    private lateinit var redisConnectionFactory: RedisConnectionFactory

    @Test
    @WithUserDetails("admin@test.com")
    fun `manual summary is persisted and returned as canonical source`() {
        mvc
            .post("/post/api/v1/posts") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "수동 요약 글",
                      "content": "본문의 자동 후보 문장입니다.",
                      "summaryMode": "MANUAL",
                      "summary": "작성자가 확정한 수동 요약"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isCreated() }
                jsonPath("$.data.summary") { value("작성자가 확정한 수동 요약") }
                jsonPath("$.data.summarySource") { value("MANUAL") }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `missing summary is deterministically extracted during write`() {
        mvc
            .post("/post/api/v1/posts") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "자동 발췌 글",
                      "content": "첫 번째 핵심 문장입니다. 두 번째 핵심 문장입니다. 세 번째 문장입니다."
                    }
                    """.trimIndent()
            }.andExpect {
                status { isCreated() }
                jsonPath("$.data.summary") { value("첫 번째 핵심 문장입니다. 두 번째 핵심 문장입니다.") }
                jsonPath("$.data.summarySource") { value("EXTRACTED") }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `omitted summary preserves manual value while blank summary recomputes`() {
        val created =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "수정 요약 글",
                          "content": "기존 본문입니다.",
                          "summaryMode": "MANUAL",
                          "summary": "유지할 수동 요약"
                        }
                        """.trimIndent()
                }.andReturn()
                .response.contentAsString
        val postId = JsonPath.read<Int>(created, "$.data.id").toLong()
        val version = JsonPath.read<Int>(created, "$.data.version").toLong()

        val preserved =
            mvc
                .put("/post/api/v1/posts/$postId") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "수정 요약 글",
                          "content": "새 본문의 첫 핵심 문장입니다. 두 번째 문장입니다.",
                          "version": $version
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.summary") { value("유지할 수동 요약") }
                    jsonPath("$.data.summarySource") { value("MANUAL") }
                }.andReturn()
                .response.contentAsString
        val preservedVersion = JsonPath.read<Int>(preserved, "$.data.version").toLong()

        mvc
            .put("/post/api/v1/posts/$postId") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "수정 요약 글",
                      "content": "새 본문의 첫 핵심 문장입니다. 두 번째 문장입니다.",
                      "summary": "   ",
                      "version": $preservedVersion
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.summary") { value("새 본문의 첫 핵심 문장입니다. 두 번째 문장입니다.") }
                jsonPath("$.data.summarySource") { value("EXTRACTED") }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `admin preview endpoint returns deterministic result without persisting`() {
        val beforeCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM post", Long::class.java)

        mvc
            .post("/post/api/v1/adm/posts/preview-summary") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "미리보기",
                      "content": "미리보기의 첫 핵심 문장입니다. 두 번째 문장입니다."
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.summary") { value("미리보기의 첫 핵심 문장입니다. 두 번째 문장입니다.") }
                jsonPath("$.source") { value("EXTRACTED") }
                jsonPath("$.contentHash") { isNotEmpty() }
                jsonPath("$.algorithmVersion") { value(PostSummaryResolver.ALGORITHM_VERSION) }
            }

        val afterCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM post", Long::class.java)
        assertThat(afterCount).isEqualTo(beforeCount)
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `idempotent backfill populates legacy summary without changing modified at`() {
        runIdempotentBackfillScenario(trial = 0)
    }

    // TEMPORARY (issue #1533 진단): CI에서만 5~10% 재현되는 flaky의 결정적 증거를 얻기 위한 반복 실행.
    // 원인 확정 후 제거한다.
    @RepeatedTest(20)
    @WithUserDetails("admin@test.com")
    fun `flake1533 diagnostic repeated idempotent backfill`(repetitionInfo: RepetitionInfo) {
        runIdempotentBackfillScenario(trial = repetitionInfo.currentRepetition)
    }

    @Suppress("LongMethod")
    private fun runIdempotentBackfillScenario(trial: Int) {
        val created =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "이전 글",
                          "content": "---\nsummary: \"이전 frontmatter 요약\"\n---\n본문입니다.",
                          "published": true,
                          "listed": true
                        }
                        """.trimIndent()
                }.andReturn()
                .response.contentAsString
        val postId = JsonPath.read<Int>(created, "$.data.id").toLong()
        val originalModifiedAt = Instant.parse("2026-01-02T03:04:05Z")

        jdbcTemplate.update(
            """
            UPDATE post
            SET summary_text = NULL,
                summary_source = 'NONE',
                summary_content_hash = NULL,
                summary_algorithm_version = NULL,
                summary_generated_at = NULL,
                version = NULL,
                modified_at = ?
            WHERE id = ?
            """.trimIndent(),
            Timestamp.from(originalModifiedAt),
            postId,
        )
        entityManager.clear()
        diagnose(trial, "01-after-reset", postId)

        val firstGet = mvc.get("/post/api/v1/posts/$postId") { with(anonymous()) }
        diagnoseResponse(trial, "02-get1", firstGet)
        diagnose(trial, "03-after-get1", postId)
        firstGet.andExpect {
            status { isOk() }
            jsonPath("$.summary") { value("") }
        }

        mvc
            .post("/post/api/v1/adm/posts/summary-backfill") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"afterId":${postId - 1},"limit":1,"dryRun":true}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.scanned") { value(1) }
                jsonPath("$.updated") { value(0) }
                jsonPath("$.nextAfterId") { value(postId - 1) }
                jsonPath("$.dryRun") { value(true) }
            }

        mvc
            .post("/post/api/v1/adm/posts/summary-backfill") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"afterId":${postId - 1},"limit":1,"dryRun":false}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.scanned") { value(1) }
                jsonPath("$.updated") { value(1) }
                jsonPath("$.skipped") { value(0) }
                jsonPath("$.nextAfterId") { value(postId) }
            }
        diagnose(trial, "04-after-backfill", postId)

        val row =
            jdbcTemplate.queryForMap(
                """
                SELECT summary_text, summary_source, summary_algorithm_version, modified_at, version
                FROM post
                WHERE id = ?
                """.trimIndent(),
                postId,
            )
        assertThat(row["summary_text"]).isEqualTo("이전 frontmatter 요약")
        assertThat(row["summary_source"]).isEqualTo("MIGRATED")
        assertThat(row["summary_algorithm_version"]).isEqualTo("legacy-frontmatter-v1")
        assertThat((row["modified_at"] as Timestamp).toInstant()).isEqualTo(originalModifiedAt)
        assertThat(row["version"]).isNull()

        entityManager.flush()
        diagnose(trial, "05-after-flush", postId)
        val payload = backfillTaskPayload(postId)
        println(
            "[flake1533] trial=$trial step=06-payload postId=${payload.postId} reason=${payload.evictReason} " +
                "targets=${payload.cacheInvalidationTargets.map { it.name }.sorted()}",
        )
        taskFacade.fire(payload)
        diagnose(trial, "07-after-fire", postId)
        entityManager.clear()
        diagnose(trial, "08-after-clear", postId)

        val secondGet = mvc.get("/post/api/v1/posts/$postId") { with(anonymous()) }
        diagnoseResponse(trial, "09-get2", secondGet)
        diagnose(trial, "10-after-get2", postId)
        secondGet.andExpect {
            status { isOk() }
            jsonPath("$.summary") { value("이전 frontmatter 요약") }
            jsonPath("$.summarySource") { value("MIGRATED") }
        }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `private backfill does not put raw tags in public invalidation tasks`() {
        val created =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "비공개 이전 글",
                          "content": "---\nsummary: \"이전 요약\"\ntags: [private-tag]\n---\n비공개 본문입니다.",
                          "published": false,
                          "listed": false
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

        mvc
            .post("/post/api/v1/adm/posts/summary-backfill") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"afterId":${postId - 1},"limit":1,"dryRun":false}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.updated") { value(1) }
            }

        entityManager.flush()
        val payload = backfillTaskPayload(postId)
        assertThat(payload.beforeTags).isEmpty()
        assertThat(payload.afterTags).isEmpty()
        assertThat(payload.cacheInvalidationTargets)
            .containsExactly(PostReadCacheInvalidationTarget.ADMIN_POSTS_FIRST_PAGE)
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `manual mode rejects blank summary`() {
        mvc
            .post("/post/api/v1/posts") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "빈 수동 요약",
                      "content": "본문입니다.",
                      "summaryMode": "MANUAL",
                      "summary": "   "
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `auto mode clears manual summary and recomputes`() {
        val created =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "mode 전환 글",
                          "content": "기존 본문입니다.",
                          "summaryMode": "MANUAL",
                          "summary": "기존 수동 요약"
                        }
                        """.trimIndent()
                }.andReturn()
                .response.contentAsString
        val postId = JsonPath.read<Int>(created, "$.data.id")
        val version = JsonPath.read<Int>(created, "$.data.version")

        mvc
            .put("/post/api/v1/posts/$postId") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "mode 전환 글",
                      "content": "자동으로 다시 계산할 핵심 문장입니다. 두 번째 문장입니다.",
                      "summaryMode": "AUTO",
                      "version": $version
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.summary") { value("자동으로 다시 계산할 핵심 문장입니다. 두 번째 문장입니다.") }
                jsonPath("$.data.summarySource") { value("EXTRACTED") }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `idempotency retry keeps the first canonical summary`() {
        val key = "summary-idempotency-${System.nanoTime()}"
        val first =
            mvc
                .post("/post/api/v1/posts") {
                    header("Idempotency-Key", key)
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "멱등 요약",
                          "content": "첫 본문입니다.",
                          "summaryMode": "MANUAL",
                          "summary": "최초 요약"
                        }
                        """.trimIndent()
                }.andReturn()
                .response.contentAsString
        val postId = JsonPath.read<Int>(first, "$.data.id")

        mvc
            .post("/post/api/v1/posts") {
                header("Idempotency-Key", key)
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "다른 제목",
                      "content": "다른 본문입니다.",
                      "summaryMode": "MANUAL",
                      "summary": "바뀌면 안 되는 요약"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isCreated() }
                jsonPath("$.data.id") { value(postId) }
                jsonPath("$.data.summary") { value("최초 요약") }
                jsonPath("$.data.summarySource") { value("MANUAL") }
            }
    }

    @Test
    fun `summary preview endpoint requires authentication`() {
        mvc
            .post("/post/api/v1/adm/posts/preview-summary") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"title":"제목","content":"본문입니다."}"""
            }.andExpect {
                status { isUnauthorized() }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `backfill beyond the last row reports an exhausted checkpoint`() {
        val maxPostId = jdbcTemplate.queryForObject("SELECT COALESCE(MAX(id), 0) FROM post", Long::class.java)!!

        mvc
            .post("/post/api/v1/adm/posts/summary-backfill") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"afterId":$maxPostId,"limit":10,"dryRun":false}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.scanned") { value(0) }
                jsonPath("$.updated") { value(0) }
                jsonPath("$.skipped") { value(0) }
                jsonPath("$.nextAfterId") { value(maxPostId) }
                jsonPath("$.hasMore") { value(false) }
            }
    }

    // TEMPORARY (issue #1533 진단): 단계별 DB row / Redis 상세 캐시 키 / 영속성 컨텍스트 상태를 stdout에 남긴다.
    // assertion 성공 여부와 무관하게 항상 출력해야 CI artifact(system-out)에서 읽을 수 있다. 원인 확정 후 제거한다.
    private fun diagnose(
        trial: Int,
        step: String,
        postId: Long,
    ) {
        println(
            "[flake1533] trial=$trial step=$step postId=$postId " +
                "row=${diagnosePostRow(postId)} redis=${diagnoseDetailCacheKeys(postId)} pc=${diagnosePersistenceContext()}",
        )
    }

    private fun diagnoseResponse(
        trial: Int,
        step: String,
        actions: ResultActionsDsl,
    ) {
        val response = actions.andReturn().response
        println(
            "[flake1533] trial=$trial step=$step status=${response.status} etag=${response.getHeader("ETag")} " +
                "body=${response.contentAsString.replace('\n', ' ').take(800)}",
        )
    }

    private fun diagnosePostRow(postId: Long): String =
        runCatching {
            jdbcTemplate
                .queryForList(
                    """
                    SELECT summary_text, summary_source, summary_algorithm_version, modified_at, version
                    FROM post
                    WHERE id = ?
                    """.trimIndent(),
                    postId,
                ).firstOrNull()
                ?.toString() ?: "absent"
        }.getOrElse { "error(${it::class.simpleName}: ${it.message})" }

    private fun diagnoseDetailCacheKeys(postId: Long): String =
        runCatching {
            redisConnectionFactory.connection.use { connection ->
                val perKey =
                    DETAIL_CACHE_NAMES.joinToString(",") { cacheName ->
                        val key = "$cacheName::$postId".toByteArray(StandardCharsets.UTF_8)
                        "$cacheName(exists=${connection.keyCommands().exists(key)},pttl=${connection.keyCommands().pTtl(key)})"
                    }
                val scanned =
                    connection
                        .keyCommands()
                        .keys("post-detail-public-*".toByteArray(StandardCharsets.UTF_8))
                        ?.map { String(it, StandardCharsets.UTF_8) }
                        ?.sorted()
                        .orEmpty()
                "[$perKey] all=$scanned"
            }
        }.getOrElse { "error(${it::class.simpleName}: ${it.message})" }

    private fun diagnosePersistenceContext(): String =
        runCatching {
            val statistics = entityManager.unwrap(Session::class.java).statistics
            val postKeys =
                statistics.entityKeys
                    .map { entityKey -> entityKey.toString() }
                    .filter { entityKey -> entityKey.contains("Post") }
                    .sorted()
            "joined=${entityManager.isJoinedToTransaction} entities=${statistics.entityCount} postKeys=$postKeys"
        }.getOrElse { "error(${it::class.simpleName}: ${it.message})" }

    private fun backfillTaskPayload(postId: Long): PostWriteSideEffectPayload {
        val payloadJson =
            jdbcTemplate.queryForObject(
                """
                SELECT payload
                FROM task
                WHERE task_type = ?
                  AND aggregate_id = ?
                  AND payload LIKE '%summary-backfill%'
                ORDER BY id DESC
                LIMIT 1
                """.trimIndent(),
                String::class.java,
                PostWriteSideEffectPayload.TASK_TYPE,
                postId,
            )
        return objectMapper.readValue(payloadJson, PostWriteSideEffectPayload::class.java)
    }

    private companion object {
        // TEMPORARY (issue #1533 진단)
        private val DETAIL_CACHE_NAMES =
            listOf(
                PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT,
                PostQueryCacheNames.DETAIL_PUBLIC_META,
                PostQueryCacheNames.DETAIL_PUBLIC_CONTENT,
                PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE,
            )
    }
}
