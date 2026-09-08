package com.back.infrastructure

import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.domain.shared.memberMixin.decodeMemberProfileWorkspaceContent
import com.back.boundedContexts.member.domain.shared.memberMixin.encodeMemberProfileWorkspaceContent
import com.back.global.security.application.HtmlContentSanitizer
import com.back.standard.util.Ut
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.nio.file.Path
import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

@Testcontainers
class RetiredStorageUrlMigrationTestcontainersIntegrationTest {
    companion object {
        private const val RETIRED_IMAGE_PREFIX = "https://api.aquilaxk.site/post/api/v1/images/"
        private const val RETIRED_FILE_PREFIX = "https://api.aquilaxk.site/post/api/v1/files/"
        private const val RELATIVE_IMAGE_PREFIX = "/post/api/v1/images/"
        private const val RELATIVE_FILE_PREFIX = "/post/api/v1/files/"

        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName
                    .parse("jangka512/pgj@sha256:a8bfcb8e5c64805429cd1406d0840ba1c13f70830e73d9f5e4a63cd7c1b62da7")
                    .asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_retired_storage_urls")
                withUsername("postgres")
                withPassword("postgres")
            }
    }

    @BeforeEach
    fun resetSchema() {
        Ut.JSON.objectMapper = jacksonObjectMapper()
        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("DROP TABLE IF EXISTS public.member_attr")
                statement.execute("DROP TABLE IF EXISTS public.post")
                statement.execute(
                    """
                    CREATE TABLE public.post (
                        id BIGINT PRIMARY KEY,
                        content TEXT,
                        content_html TEXT,
                        content_html_hash TEXT,
                        content_html_sanitizer_policy_version TEXT,
                        content_html_trust_state TEXT,
                        version BIGINT,
                        modified_at TIMESTAMPTZ
                    )
                    """.trimIndent(),
                )
                statement.execute(
                    """
                    CREATE TABLE public.member_attr (
                        subject_id BIGINT NOT NULL,
                        name TEXT NOT NULL,
                        str_value TEXT,
                        modified_at TIMESTAMPTZ,
                        UNIQUE (subject_id, name)
                    )
                    """.trimIndent(),
                )
            }
        }
    }

    @Test
    fun `migration copies stay identical and rewrite only canonical retired storage URLs`() {
        assertEquals(productionMigration(), testMigration())

        postgres.createConnection("").use { connection ->
            val modifiedAt = Instant.parse("2026-09-08T00:00:00Z")
            val imageUrl = "${RETIRED_IMAGE_PREFIX}posts/a%20file.png?download=1#preview"
            val fileUrl = "${RETIRED_FILE_PREFIX}files/report.pdf?version=2#page-3"
            val changedContent = "![image]($imageUrl)\n[file]($fileUrl)"
            val changedHtml = "<img src=\"$imageUrl\"><a href=\"$fileUrl\">file</a>"
            val invalidHashHtml = "<img src=\"$imageUrl\">"
            val unchangedContent = "![other](https://cdn.example.test/images/keep.png)"
            val unchangedHtml = "<img src=\"https://cdn.example.test/images/keep.png\">"
            val draftRaw = canonicalWorkspace("${RETIRED_IMAGE_PREFIX}profiles/draft%20image.png?x=1#focus")
            val publishedRaw = canonicalWorkspace("${RETIRED_FILE_PREFIX}profiles/published.pdf?x=2#attachment")
            val escapedUnrelatedJson =
                """{"content":{"profileImageUrl":"/images/current.png","profileBio":"https:\/\/api.aquilaxk.site\/post\/api\/v1\/images\/unrelated.png"}}"""

            insertPost(connection, 1, changedContent, changedHtml, HtmlContentSanitizer.sha256Utf8(changedHtml), 7, modifiedAt)
            insertPost(connection, 2, fileUrl, invalidHashHtml, "invalid-hash", 3, modifiedAt)
            insertPost(connection, 3, unchangedContent, unchangedHtml, HtmlContentSanitizer.sha256Utf8(unchangedHtml), 9, modifiedAt)
            insertPost(connection, 4, imageUrl, invalidHashHtml, null, null, modifiedAt)
            insertAttr(connection, 1, "profileWorkspaceDraft", draftRaw, modifiedAt)
            insertAttr(connection, 1, "profileWorkspacePublished", publishedRaw, modifiedAt)
            insertAttr(connection, 2, "profileWorkspaceDraft", escapedUnrelatedJson, modifiedAt)

            val unchangedPostBefore = postSnapshot(connection, 3)
            val escapedUnrelatedBefore = attrSnapshot(connection, 2, "profileWorkspaceDraft")

            executeMigration(connection)

            val changedPost = postSnapshot(connection, 1)
            assertEquals(
                changedContent
                    .replace(RETIRED_IMAGE_PREFIX, RELATIVE_IMAGE_PREFIX)
                    .replace(RETIRED_FILE_PREFIX, RELATIVE_FILE_PREFIX),
                changedPost.content,
            )
            assertEquals(
                changedHtml
                    .replace(RETIRED_IMAGE_PREFIX, RELATIVE_IMAGE_PREFIX)
                    .replace(RETIRED_FILE_PREFIX, RELATIVE_FILE_PREFIX),
                changedPost.contentHtml,
            )
            assertEquals(HtmlContentSanitizer.sha256Utf8(requireNotNull(changedPost.contentHtml)), changedPost.contentHtmlHash)
            assertEquals(8L, changedPost.version)
            assertNotEquals(modifiedAt, changedPost.modifiedAt)
            assertEquals("sanitizer-v1", changedPost.sanitizerPolicyVersion)
            assertEquals("TRUSTED_CURRENT", changedPost.trustState)

            val invalidHashPost = postSnapshot(connection, 2)
            assertEquals(RELATIVE_FILE_PREFIX + "files/report.pdf?version=2#page-3", invalidHashPost.content)
            assertEquals(invalidHashHtml.replace(RETIRED_IMAGE_PREFIX, RELATIVE_IMAGE_PREFIX), invalidHashPost.contentHtml)
            assertEquals("invalid-hash", invalidHashPost.contentHtmlHash)
            assertEquals(4L, invalidHashPost.version)
            assertNotEquals(modifiedAt, invalidHashPost.modifiedAt)

            val nullHashPost = postSnapshot(connection, 4)
            assertEquals(imageUrl.replace(RETIRED_IMAGE_PREFIX, RELATIVE_IMAGE_PREFIX), nullHashPost.content)
            assertEquals(invalidHashHtml.replace(RETIRED_IMAGE_PREFIX, RELATIVE_IMAGE_PREFIX), nullHashPost.contentHtml)
            assertEquals(null, nullHashPost.contentHtmlHash)
            assertEquals(1L, nullHashPost.version)
            assertNotEquals(modifiedAt, nullHashPost.modifiedAt)

            assertEquals(unchangedPostBefore, postSnapshot(connection, 3))
            assertEquals(escapedUnrelatedBefore, attrSnapshot(connection, 2, "profileWorkspaceDraft"))

            val draftAfter = requireNotNull(attrSnapshot(connection, 1, "profileWorkspaceDraft").value)
            val publishedAfter = requireNotNull(attrSnapshot(connection, 1, "profileWorkspacePublished").value)
            assertEquals(
                "${RELATIVE_IMAGE_PREFIX}profiles/draft%20image.png?x=1#focus",
                decodeMemberProfileWorkspaceContent(draftAfter)?.profileImageUrl,
            )
            assertEquals(
                "${RELATIVE_FILE_PREFIX}profiles/published.pdf?x=2#attachment",
                decodeMemberProfileWorkspaceContent(publishedAfter)?.profileImageUrl,
            )
            assertNotEquals(draftRaw, draftAfter)
            assertNotEquals(publishedRaw, publishedAfter)
            assertNotEquals(modifiedAt, attrSnapshot(connection, 1, "profileWorkspaceDraft").modifiedAt)
            assertNotEquals(modifiedAt, attrSnapshot(connection, 1, "profileWorkspacePublished").modifiedAt)

            val changedPostAfterFirstRun = postSnapshot(connection, 1)
            val draftAfterFirstRun = attrSnapshot(connection, 1, "profileWorkspaceDraft")
            executeMigration(connection)
            assertEquals(changedPostAfterFirstRun, postSnapshot(connection, 1))
            assertEquals(draftAfterFirstRun, attrSnapshot(connection, 1, "profileWorkspaceDraft"))
        }
    }

    private fun insertPost(
        connection: Connection,
        id: Long,
        content: String,
        contentHtml: String,
        contentHtmlHash: String?,
        version: Long?,
        modifiedAt: Instant,
    ) {
        connection
            .prepareStatement(
                """
                INSERT INTO public.post (
                    id, content, content_html, content_html_hash, content_html_sanitizer_policy_version,
                    content_html_trust_state, version, modified_at
                ) VALUES (?, ?, ?, ?, 'sanitizer-v1', 'TRUSTED_CURRENT', ?, ?)
                """.trimIndent(),
            ).use { statement ->
                statement.setLong(1, id)
                statement.setString(2, content)
                statement.setString(3, contentHtml)
                statement.setString(4, contentHtmlHash)
                statement.setObject(5, version)
                statement.setTimestamp(6, Timestamp.from(modifiedAt))
                statement.executeUpdate()
            }
    }

    private fun insertAttr(
        connection: Connection,
        subjectId: Long,
        name: String,
        value: String,
        modifiedAt: Instant,
    ) {
        connection
            .prepareStatement(
                "INSERT INTO public.member_attr (subject_id, name, str_value, modified_at) VALUES (?, ?, ?, ?)",
            ).use { statement ->
                statement.setLong(1, subjectId)
                statement.setString(2, name)
                statement.setString(3, value)
                statement.setTimestamp(4, Timestamp.from(modifiedAt))
                statement.executeUpdate()
            }
    }

    private fun executeMigration(connection: Connection) {
        connection.autoCommit = false
        try {
            connection.createStatement().use { statement -> statement.execute(productionMigration()) }
            connection.commit()
        } catch (failure: Exception) {
            connection.rollback()
            throw failure
        } finally {
            connection.autoCommit = true
        }
    }

    private fun postSnapshot(
        connection: Connection,
        id: Long,
    ): PostSnapshot =
        connection
            .prepareStatement(
                """
                SELECT content, content_html, content_html_hash, content_html_sanitizer_policy_version,
                       content_html_trust_state, version, modified_at
                FROM public.post WHERE id = ?
                """.trimIndent(),
            ).use { statement ->
                statement.setLong(1, id)
                statement.executeQuery().use { result ->
                    result.next()
                    PostSnapshot(
                        content = result.getString("content"),
                        contentHtml = result.getString("content_html"),
                        contentHtmlHash = result.getString("content_html_hash"),
                        sanitizerPolicyVersion = result.getString("content_html_sanitizer_policy_version"),
                        trustState = result.getString("content_html_trust_state"),
                        version = result.getLong("version"),
                        modifiedAt = result.getTimestamp("modified_at")?.toInstant(),
                    )
                }
            }

    private fun attrSnapshot(
        connection: Connection,
        subjectId: Long,
        name: String,
    ): AttrSnapshot =
        connection
            .prepareStatement(
                "SELECT str_value, modified_at FROM public.member_attr WHERE subject_id = ? AND name = ?",
            ).use { statement ->
                statement.setLong(1, subjectId)
                statement.setString(2, name)
                statement.executeQuery().use { result ->
                    result.next()
                    AttrSnapshot(result.getString("str_value"), result.getTimestamp("modified_at")?.toInstant())
                }
            }

    private fun canonicalWorkspace(profileImageUrl: String): String =
        encodeMemberProfileWorkspaceContent(MemberProfileWorkspaceContent(profileImageUrl = profileImageUrl))

    private fun productionMigration(): String =
        Path.of("src/main/resources/db/migration/V20260908_01__migrate_retired_storage_urls.sql").toFile().readText()

    private fun testMigration(): String =
        Path.of("src/main/resources/db/migration-test/V20260908_01__migrate_retired_storage_urls.sql").toFile().readText()

    private data class PostSnapshot(
        val content: String?,
        val contentHtml: String?,
        val contentHtmlHash: String?,
        val sanitizerPolicyVersion: String?,
        val trustState: String?,
        val version: Long,
        val modifiedAt: Instant?,
    )

    private data class AttrSnapshot(
        val value: String?,
        val modifiedAt: Instant?,
    )
}
