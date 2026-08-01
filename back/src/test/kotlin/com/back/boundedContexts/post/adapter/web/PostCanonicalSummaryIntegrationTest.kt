package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.service.PostSummaryBackfillService
import com.back.boundedContexts.post.application.service.PostSummaryResolver
import com.back.support.BaseControllerIntegrationTest
import com.jayway.jsonpath.JsonPath
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.sql.Timestamp
import java.time.Instant

@org.junit.jupiter.api.DisplayName("게시글 canonical summary 통합 테스트")
class PostCanonicalSummaryIntegrationTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    private lateinit var postSummaryBackfillService: PostSummaryBackfillService

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
                          "summary": "유지할 수동 요약"
                        }
                        """.trimIndent()
                }.andReturn().response.contentAsString
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
                }.andReturn().response.contentAsString
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
            }

        val afterCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM post", Long::class.java)
        assertThat(afterCount).isEqualTo(beforeCount)
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `idempotent backfill populates legacy summary without changing modified at`() {
        val created =
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "이전 글",
                          "content": "---\nsummary: \\\"이전 frontmatter 요약\\\"\n---\n본문입니다."
                        }
                        """.trimIndent()
                }.andReturn().response.contentAsString
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
                modified_at = ?
            WHERE id = ?
            """.trimIndent(),
            Timestamp.from(originalModifiedAt),
            postId,
        )

        assertThat(postSummaryBackfillService.backfillNextBatch(100)).isGreaterThanOrEqualTo(1)
        assertThat(postSummaryBackfillService.backfillNextBatch(100)).isEqualTo(0)

        val row =
            jdbcTemplate.queryForMap(
                """
                SELECT summary_text, summary_source, summary_algorithm_version, modified_at
                FROM post
                WHERE id = ?
                """.trimIndent(),
                postId,
            )
        assertThat(row["summary_text"]).isEqualTo("이전 frontmatter 요약")
        assertThat(row["summary_source"]).isEqualTo("MIGRATED")
        assertThat(row["summary_algorithm_version"]).isEqualTo("legacy-frontmatter-v1")
        assertThat((row["modified_at"] as Timestamp).toInstant()).isEqualTo(originalModifiedAt)
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
    fun `manual summary length contract includes ellipsis inside limit`() {
        val resolved =
            PostSummaryResolver.resolveForCreate(
                title = "제목",
                content = "본문",
                submittedSummary = "가".repeat(200),
                now = Instant.parse("2026-08-01T00:00:00Z"),
            )

        assertThat(resolved.text).hasSize(PostSummaryResolver.MAX_GRAPHEMES)
        assertThat(resolved.text).endsWith("…")
    }
}
