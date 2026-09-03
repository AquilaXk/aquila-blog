package com.back.infrastructure

import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileAboutSectionBlock
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.domain.shared.memberMixin.encodeMemberProfileWorkspaceContent
import com.back.standard.util.Ut
import org.junit.jupiter.api.Test
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.nio.file.Path
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@Testcontainers
class ProfileWorkspaceCanonicalInventoryTestcontainersIntegrationTest {
    companion object {
        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName
                    .parse("jangka512/pgj@sha256:a8bfcb8e5c64805429cd1406d0840ba1c13f70830e73d9f5e4a63cd7c1b62da7")
                    .asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_profile_workspace_inventory")
                withUsername("postgres")
                withPassword("postgres")
            }
    }

    @Test
    fun `canonical inventory covers deleted members and categorizes workspace failures`() {
        Ut.JSON.objectMapper = jacksonObjectMapper()
        postgres.createConnection("").use { connection ->
            val legacyAboutDetails = "## About\n- One\n\n---\n\n## Notes\n- Two"
            connection.createStatement().use { statement ->
                statement.execute("CREATE TABLE member (id BIGINT PRIMARY KEY, deleted_at TIMESTAMPTZ)")
                statement.execute(
                    """
                    CREATE TABLE member_attr (
                        subject_id BIGINT NOT NULL,
                        name TEXT NOT NULL,
                        str_value TEXT,
                        UNIQUE (subject_id, name)
                    )
                    """.trimIndent(),
                )
                statement.execute("INSERT INTO member (id, deleted_at) VALUES (1, NULL), (2, NULL), (3, now()), (4, NULL), (5, NULL)")
                statement.execute(
                    """
                    INSERT INTO member_attr (subject_id, name, str_value) VALUES
                    (1, 'profileWorkspaceDraft', '${canonicalWorkspace("image-1", "role-1")}'),
                    (1, 'profileWorkspacePublished', '${canonicalWorkspace("image-published", "role-published")}'),
                    (1, 'profileImgUrl', 'image-1'),
                    (1, 'profileRole', 'role-1'),
                    (1, 'aboutDetails', '$legacyAboutDetails'),
                    (1, 'profileServiceLinks', '{"items":[{"icon":"service","label":"Source","href":"https://github.com/AquilaXk/aquila-blog"}]}'),
                    (1, 'profileContactLinks', '{"items":[{"icon":"mail","label":"Email","href":"mailto:aquila@aquilaxk.site"}]}'),
                    (3, 'profileWorkspaceDraft', '   '),
                    (4, 'profileWorkspaceDraft', '{bad json'),
                    (5, 'profileWorkspaceDraft', '${noncanonicalWorkspace()}'),
                    (5, 'profileImgUrl', 'image-other')
                    """.trimIndent(),
                )
            }

            val statements =
                Path
                    .of("..", "deploy", "homeserver", "sql", "profile_workspace_canonical_inventory.sql")
                    .toFile()
                    .readText()
                    .split(';')
                    .map(String::trim)
                    .filter(String::isNotEmpty)
            assertEquals(5, statements.size)

            try {
                connection.createStatement().use { statement ->
                    statements.take(3).forEach(statement::execute)
                    statement.executeQuery(statements[3]).use { result ->
                        assertTrue(result.next())
                        assertTrue(result.getBoolean("read_only"))
                        assertEquals(
                            mapOf(
                                "total_member_count" to 5,
                                "active_member_count" to 4,
                                "deleted_member_count" to 1,
                                "draft_missing_count" to 1,
                                "draft_blank_count" to 1,
                                "draft_invalid_count" to 1,
                                "draft_noncanonical_count" to 1,
                                "draft_canonical_count" to 1,
                                "published_missing_count" to 4,
                                "published_blank_count" to 0,
                                "published_invalid_count" to 0,
                                "published_noncanonical_count" to 0,
                                "published_valid_count" to 1,
                                "draft_published_different_count" to 1,
                                "draft_image_parity_count" to 1,
                                "legacy_workspace_mismatch_count" to 0,
                            ),
                            listOf(
                                "total_member_count",
                                "active_member_count",
                                "deleted_member_count",
                                "draft_missing_count",
                                "draft_blank_count",
                                "draft_invalid_count",
                                "draft_noncanonical_count",
                                "draft_canonical_count",
                                "published_missing_count",
                                "published_blank_count",
                                "published_invalid_count",
                                "published_noncanonical_count",
                                "published_valid_count",
                                "draft_published_different_count",
                                "draft_image_parity_count",
                                "legacy_workspace_mismatch_count",
                            ).associateWith(result::getInt),
                        )
                        assertTrue(result.getBoolean("lifecycle_partition_ok"))
                        assertTrue(result.getBoolean("draft_partition_ok"))
                        assertTrue(result.getBoolean("published_partition_ok"))
                    }
                }
            } finally {
                connection.createStatement().use { statement -> statement.execute(statements[4]) }
            }
        }
    }

    private fun canonicalWorkspace(
        image: String,
        role: String,
    ): String =
        encodeMemberProfileWorkspaceContent(
            MemberProfileWorkspaceContent(
                profileImageUrl = image,
                profileRole = role,
                aboutSections =
                    listOf(
                        MemberProfileAboutSectionBlock(
                            id = "section-1",
                            title = "About",
                            items = listOf("One"),
                        ),
                        MemberProfileAboutSectionBlock(
                            id = "section-2",
                            title = "Notes",
                            items = listOf("Two"),
                            dividerBefore = true,
                        ),
                    ),
                serviceLinks =
                    listOf(
                        MemberProfileLinkItem(
                            icon = "service",
                            label = "Source",
                            href = "https://github.com/AquilaXk/aquila-blog",
                        ),
                    ),
                contactLinks =
                    listOf(
                        MemberProfileLinkItem(
                            icon = "mail",
                            label = "Email",
                            href = "mailto:aquila@aquilaxk.site",
                        ),
                    ),
            ),
        )

    private fun noncanonicalWorkspace(): String =
        """{"content":{"profileImageUrl":" image-5 ","profileRole":"role-5","profileBio":"","aboutHeadline":"","aboutRole":"","aboutBio":"","aboutSections":[],"aboutProjectSectionTitle":"","aboutProjects":[],"blogTitle":"","homeIntroTitle":"","homeIntroDescription":"","blogDesign":"legacy","legacyBlogScheme":"dark","serviceLinks":[],"contactLinks":[]}}"""
}
