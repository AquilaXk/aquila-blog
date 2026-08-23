package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.CanonicalSummaryFixture
import com.back.boundedContexts.post.CanonicalSummaryFixture.Fixture
import com.back.boundedContexts.post.CanonicalSummaryFixture.Request
import com.back.boundedContexts.post.application.service.PostReadCacheInvalidationTarget
import com.back.boundedContexts.post.application.service.PostWriteSideEffectHandler
import com.back.boundedContexts.post.application.service.PostWriteSideEffectPayload
import com.back.global.task.application.TaskPayloadEnvelope
import com.back.support.BaseControllerIntegrationTest
import com.jayway.jsonpath.JsonPath
import jakarta.persistence.EntityManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import tools.jackson.databind.ObjectMapper
import java.sql.Timestamp
import java.time.Instant

@org.junit.jupiter.api.DisplayName("게시글 canonical summary 통합 테스트")
class PostCanonicalSummaryIntegrationTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    private lateinit var postWriteSideEffectHandler: PostWriteSideEffectHandler

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @Autowired
    private lateinit var entityManager: EntityManager

    @Test
    @WithUserDetails("admin@test.com")
    fun `manual summary is persisted and returned as canonical source`() {
        val fixture = resolvedFixture("manual-create", "create")
        val expected = requireNotNull(fixture.expected)
        mvc
            .post("/post/api/v1/posts") {
                contentType = MediaType.APPLICATION_JSON
                content = postPayload(fixture)
            }.andExpect {
                status { isCreated() }
                jsonPath("$.data.summary") { value(expected.summary) }
                jsonPath("$.data.summarySource") { value(expected.source) }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `missing summary is deterministically extracted during write`() {
        val fixture = resolvedFixture("extracted-with-exclusions", "create")
        val expected = requireNotNull(fixture.expected)
        mvc
            .post("/post/api/v1/posts") {
                contentType = MediaType.APPLICATION_JSON
                content = postPayload(fixture)
            }.andExpect {
                status { isCreated() }
                jsonPath("$.data.summary") { value(expected.summary) }
                jsonPath("$.data.summarySource") { value(expected.source) }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `omitted summary preserves manual value while blank summary recomputes`() {
        val seed = resolvedFixture("manual-preserve-seed", "create")
        val preservedFixture = resolvedFixture("manual-preserve-omitted", "modify")
        val seedExpected = requireNotNull(seed.expected)
        val preservedExpected = requireNotNull(preservedFixture.expected)
        val recomputeFixture = resolvedFixture("blank-recompute", "modify")
        val recomputeExpected = requireNotNull(recomputeFixture.expected)
        val existing = requireNotNull(preservedFixture.existing)
        val recomputeExisting = requireNotNull(recomputeFixture.existing)
        assertThat(existing.summary).isEqualTo(seedExpected.summary)
        assertThat(existing.source).isEqualTo(seedExpected.source)
        assertThat(recomputeExisting.summary).isEqualTo(preservedExpected.summary)
        assertThat(recomputeExisting.source).isEqualTo(preservedExpected.source)
        val created =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content = postPayload(seed)
                }.andReturn()
                .response.contentAsString
        val postId = JsonPath.read<Int>(created, "$.data.id").toLong()
        val version = JsonPath.read<Int>(created, "$.data.version").toLong()

        val preserved =
            mvc
                .put("/post/api/v1/posts/$postId") {
                    contentType = MediaType.APPLICATION_JSON
                    content = postPayload(preservedFixture, version = version)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.summary") { value(preservedExpected.summary) }
                    jsonPath("$.data.summarySource") { value(preservedExpected.source) }
                }.andReturn()
                .response.contentAsString
        val preservedVersion = JsonPath.read<Int>(preserved, "$.data.version").toLong()

        mvc
            .put("/post/api/v1/posts/$postId") {
                contentType = MediaType.APPLICATION_JSON
                content = postPayload(recomputeFixture, version = preservedVersion)
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.summary") { value(recomputeExpected.summary) }
                jsonPath("$.data.summarySource") { value(recomputeExpected.source) }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `admin preview endpoint returns deterministic result without persisting`() {
        val fixture = resolvedFixture("extracted-with-exclusions", "create")
        val expected = requireNotNull(fixture.expected)
        val beforeCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM post", Long::class.java)

        mvc
            .post("/post/api/v1/adm/posts/preview-summary") {
                contentType = MediaType.APPLICATION_JSON
                content = postPayload(fixture)
            }.andExpect {
                status { isOk() }
                jsonPath("$.summary") { value(expected.summary) }
                jsonPath("$.source") { value(expected.source) }
                jsonPath("$.contentHash") { isNotEmpty() }
                jsonPath("$.algorithmVersion") { value(expected.algorithmVersion) }
            }

        val afterCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM post", Long::class.java)
        assertThat(afterCount).isEqualTo(beforeCount)
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `idempotent backfill populates legacy summary without changing modified at`() {
        val fixture = resolvedFixture("idempotent-backfill-api", "backfill")
        val expected = requireNotNull(fixture.expected)
        val created =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        objectMapper.writeValueAsString(
                            mapOf("title" to fixture.title, "content" to fixture.content, "published" to true, "listed" to true),
                        )
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

        mvc.get("/post/api/v1/posts/$postId") { with(anonymous()) }.andExpect {
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

        val row =
            jdbcTemplate.queryForMap(
                """
                SELECT summary_text, summary_source, summary_algorithm_version, modified_at, version
                FROM post
                WHERE id = ?
                """.trimIndent(),
                postId,
            )
        assertThat(row["summary_text"]).isEqualTo(expected.summary)
        assertThat(row["summary_source"]).isEqualTo(expected.source)
        assertThat(row["summary_algorithm_version"]).isEqualTo(expected.algorithmVersion)
        assertThat((row["modified_at"] as Timestamp).toInstant()).isEqualTo(originalModifiedAt)
        assertThat(row["version"]).isNull()

        entityManager.flush()
        postWriteSideEffectHandler.handle(backfillTaskPayload(postId))
        entityManager.clear()

        mvc.get("/post/api/v1/posts/$postId") { with(anonymous()) }.andExpect {
            status { isOk() }
            jsonPath("$.summary") { value(expected.summary) }
            jsonPath("$.summarySource") { value(expected.source) }
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
        val fixture = rejectedFixture("manual-blank-rejection", "create")
        mvc
            .post("/post/api/v1/posts") {
                contentType = MediaType.APPLICATION_JSON
                content = postPayload(fixture)
            }.andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `auto mode clears manual summary and recomputes`() {
        val fixture = resolvedFixture("auto-recompute", "modify")
        val expected = requireNotNull(fixture.expected)
        val created =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content = postPayload(fixture, requireNotNull(fixture.existing).toRequest())
                }.andReturn()
                .response.contentAsString
        val postId = JsonPath.read<Int>(created, "$.data.id")
        val version = JsonPath.read<Int>(created, "$.data.version")

        mvc
            .put("/post/api/v1/posts/$postId") {
                contentType = MediaType.APPLICATION_JSON
                content = postPayload(fixture, fixture.request, version)
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.summary") { value(expected.summary) }
                jsonPath("$.data.summarySource") { value(expected.source) }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `idempotency retry keeps the first canonical summary`() {
        val fixture = resolvedFixture("idempotent-first-write", "create")
        val expected = requireNotNull(fixture.expected)
        val key = "summary-idempotency-${System.nanoTime()}"
        val first =
            mvc
                .post("/post/api/v1/posts") {
                    header("Idempotency-Key", key)
                    contentType = MediaType.APPLICATION_JSON
                    content = postPayload(fixture)
                }.andReturn()
                .response.contentAsString
        val postId = JsonPath.read<Int>(first, "$.data.id")

        mvc
            .post("/post/api/v1/posts") {
                header("Idempotency-Key", key)
                contentType = MediaType.APPLICATION_JSON
                content = postPayload(fixture, requireNotNull(fixture.retry))
            }.andExpect {
                status { isCreated() }
                jsonPath("$.data.id") { value(postId) }
                jsonPath("$.data.summary") { value(expected.summary) }
                jsonPath("$.data.summarySource") { value(expected.source) }
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
        val envelope = objectMapper.readValue(payloadJson, TaskPayloadEnvelope::class.java)
        return objectMapper.readValue(envelope.payloadJson, PostWriteSideEffectPayload::class.java)
    }

    private fun postPayload(
        fixture: Fixture,
        request: Request = fixture.request,
        version: Number? = null,
    ): String {
        val body = linkedMapOf<String, Any>("title" to fixture.title, "content" to fixture.content)
        request.summaryMode?.let { body["summaryMode"] = it }
        request.summary?.let { body["summary"] = it }
        version?.let { body["version"] = it }
        return objectMapper.writeValueAsString(body)
    }

    private fun CanonicalSummaryFixture.Existing.toRequest(): Request {
        check(source == "MANUAL") { "existing summary source must be MANUAL for AUTO recompute setup" }
        return Request(summaryMode = source, summary = summary)
    }

    private fun resolvedFixture(
        id: String,
        resolve: String,
    ): Fixture =
        CanonicalSummaryFixture.fixture(id).also {
            assertThat(it.resolve).isEqualTo(resolve)
            assertThat(it.outcome).isEqualTo("RESOLVED")
        }

    private fun rejectedFixture(
        id: String,
        resolve: String,
    ): Fixture =
        CanonicalSummaryFixture.fixture(id).also {
            assertThat(it.resolve).isEqualTo(resolve)
            assertThat(it.outcome).isEqualTo("MANUAL_SUMMARY_REQUIRED")
            assertThat(it.expected).isNull()
        }
}
