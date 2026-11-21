package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.CanonicalSummaryFixture
import com.back.boundedContexts.post.CanonicalSummaryFixture.Fixture
import com.back.boundedContexts.post.CanonicalSummaryFixture.Request
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
    fun `create rejects missing and mismatched summary intent`() {
        val invalidRequests =
            listOf(
                emptyMap(),
                mapOf("summary" to "암묵적 수동 요약"),
                mapOf("summaryMode" to "AUTO", "summary" to ""),
                mapOf("summaryMode" to "AUTO", "summary" to "암묵적 값"),
                mapOf("summaryMode" to "MANUAL"),
                mapOf("summaryMode" to "MANUAL", "summary" to "   "),
            )

        invalidRequests.forEach { intent ->
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        objectMapper.writeValueAsString(
                            linkedMapOf<String, Any?>(
                                "title" to "명시 요약 의도",
                                "content" to "본문입니다.",
                                "published" to true,
                                "listed" to true,
                            ).apply { putAll(intent) },
                        )
                }.andExpect {
                    status { isBadRequest() }
                }
        }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `modify preserves omitted summary accepts manual and rejects mismatches`() {
        val seed = resolvedFixture("manual-preserve-seed", "create")
        val unchanged = resolvedFixture("manual-preserve-omitted", "modify")
        val created =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content = postPayload(seed)
                }.andReturn()
                .response.contentAsString
        val postId = JsonPath.read<Int>(created, "$.data.id").toLong()
        val version = JsonPath.read<Int>(created, "$.data.version").toLong()
        val before = canonicalSummaryRow(postId)

        val unchangedResponse =
            mvc
                .put("/post/api/v1/posts/$postId") {
                    contentType = MediaType.APPLICATION_JSON
                    content = postPayload(unchanged, version = version)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.summary") { value(requireNotNull(unchanged.expected).summary) }
                }.andReturn()
                .response.contentAsString
        assertThat(canonicalSummaryRow(postId)).isEqualTo(before)

        val unchangedVersion = JsonPath.read<Int>(unchangedResponse, "$.data.version").toLong()
        val manualResponse =
            mvc
                .put("/post/api/v1/posts/$postId") {
                    contentType = MediaType.APPLICATION_JSON
                    content = postPayload(unchanged, Request("MANUAL", "새 수동 요약"), unchangedVersion)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.summary") { value("새 수동 요약") }
                    jsonPath("$.data.summarySource") { value("MANUAL") }
                }.andReturn()
                .response.contentAsString
        val currentVersion = JsonPath.read<Int>(manualResponse, "$.data.version").toLong()
        val currentCanonical = canonicalSummaryRow(postId)

        val invalidRequests =
            listOf(
                Request(null, "   "),
                Request(null, "암묵적 수동 요약"),
                Request("AUTO", ""),
                Request("AUTO", "암묵적 값"),
                Request("MANUAL", null),
                Request("MANUAL", "   "),
            )
        invalidRequests.forEach { request ->
            mvc
                .put("/post/api/v1/posts/$postId") {
                    contentType = MediaType.APPLICATION_JSON
                    content = postPayload(unchanged, request, currentVersion)
                }.andExpect {
                    status { isBadRequest() }
                }
            assertThat(canonicalSummaryRow(postId)).isEqualTo(currentCanonical)
        }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `persisted migrated fixture is readable and omitted modify preserves canonical fields`() {
        val fixture = resolvedFixture("migrated-persisted-read", "read")
        val persisted = requireNotNull(fixture.persisted)
        val created =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        objectMapper.writeValueAsString(
                            mapOf(
                                "title" to fixture.title,
                                "content" to fixture.content,
                                "published" to true,
                                "listed" to true,
                                "summaryMode" to "AUTO",
                            ),
                        )
                }.andReturn()
                .response.contentAsString
        val postId = JsonPath.read<Int>(created, "$.data.id").toLong()
        val version = JsonPath.read<Int>(created, "$.data.version").toLong()
        jdbcTemplate.update(
            """
            UPDATE post
            SET summary_text = ?, summary_source = ?, summary_content_hash = ?,
                summary_algorithm_version = ?, summary_generated_at = ?
            WHERE id = ?
            """.trimIndent(),
            persisted.summary,
            persisted.source,
            "a".repeat(64),
            persisted.algorithmVersion,
            Timestamp.from(Instant.parse("2026-08-01T00:00:00Z")),
            postId,
        )
        entityManager.clear()
        val before = canonicalSummaryRow(postId)

        mvc.get("/post/api/v1/posts/$postId") { with(anonymous()) }.andExpect {
            status { isOk() }
            jsonPath("$.summary") { value(persisted.summary) }
            jsonPath("$.summarySource") { value(persisted.source) }
        }

        mvc
            .put("/post/api/v1/posts/$postId") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    objectMapper.writeValueAsString(
                        mapOf(
                            "title" to "수정된 제목",
                            "content" to "수정된 본문입니다.",
                            "version" to version,
                        ),
                    )
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.summary") { value(persisted.summary) }
                jsonPath("$.data.summarySource") { value(persisted.source) }
            }
        assertThat(canonicalSummaryRow(postId)).isEqualTo(before)
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
                content = postPayload(fixture, requireNotNull(fixture.request), version)
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

        val beforeInvalidReplay = canonicalSummaryRow(postId.toLong())
        mvc
            .post("/post/api/v1/posts") {
                header("Idempotency-Key", key)
                contentType = MediaType.APPLICATION_JSON
                content = postPayload(fixture, Request("AUTO", "허용되지 않는 요약"))
            }.andExpect {
                status { isBadRequest() }
            }
        assertThat(canonicalSummaryRow(postId.toLong())).isEqualTo(beforeInvalidReplay)
    }

    private fun canonicalSummaryRow(postId: Long): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            """
            SELECT summary_text, summary_source, summary_content_hash,
                   summary_algorithm_version, summary_generated_at
            FROM post
            WHERE id = ?
            """.trimIndent(),
            postId,
        )

    private fun postPayload(
        fixture: Fixture,
        request: Request = requireNotNull(fixture.request),
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
