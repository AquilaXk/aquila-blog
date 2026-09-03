package com.back.infrastructure

import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileAboutProjectBlock
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileAboutSectionBlock
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.domain.shared.memberMixin.encodeMemberProfileWorkspaceContent
import com.back.standard.util.Ut
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.nio.file.Path
import java.sql.Connection
import java.sql.SQLException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

@Testcontainers
class ProfileWorkspaceLegacyRetirementTestcontainersIntegrationTest {
    companion object {
        private const val FIRST_SHA = "1111111111111111111111111111111111111111"
        private const val LATER_SHA = "2222222222222222222222222222222222222222"

        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName
                    .parse("jangka512/pgj@sha256:a8bfcb8e5c64805429cd1406d0840ba1c13f70830e73d9f5e4a63cd7c1b62da7")
                    .asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_profile_workspace_retirement")
                withUsername("postgres")
                withPassword("postgres")
            }

        private val retiredNames =
            listOf(
                "profileImgUrl",
                "profileRole",
                "profileBio",
                "aboutRole",
                "aboutBio",
                "aboutDetails",
                "blogTitle",
                "homeIntroTitle",
                "homeIntroDescription",
                "blogDesign",
                "legacyBlogScheme",
                "profileServiceLinks",
                "profileContactLinks",
            )
    }

    @BeforeEach
    fun resetSchema() {
        Ut.JSON.objectMapper = jacksonObjectMapper()
        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("DROP TABLE IF EXISTS public.platform_schema_cutover")
                statement.execute("DROP TABLE IF EXISTS public.member_attr")
                statement.execute("DROP TABLE IF EXISTS public.member")
                statement.execute("CREATE TABLE public.member (id BIGINT PRIMARY KEY, deleted_at TIMESTAMPTZ)")
                statement.execute(
                    """
                    CREATE TABLE public.member_attr (
                        subject_id BIGINT NOT NULL,
                        name TEXT NOT NULL,
                        str_value TEXT,
                        UNIQUE (subject_id, name)
                    )
                    """.trimIndent(),
                )
                statement.execute(productionMigration())
            }
        }
    }

    @Test
    fun `migration copies stay identical and valid retirement preserves canonical evidence`() {
        assertEquals(productionMigration(), testMigration())

        postgres.createConnection("").use { connection ->
            insertMember(connection, 1, deleted = false)
            insertMember(connection, 2, deleted = true)
            val draft = canonicalWorkspace("draft.png", "Backend engineer")
            val published = canonicalWorkspace("published.png", "Published engineer")
            insertAttr(connection, 1, "profileWorkspaceDraft", draft)
            insertAttr(connection, 1, "profileWorkspacePublished", published)
            insertAttr(connection, 1, "unrelated", "keep")
            retiredNames.forEachIndexed { index, name ->
                insertAttr(connection, if (index % 2 == 0) 1 else 2, name, "retired-$index")
            }
            insertAttr(connection, 2, "profileWorkspaceDraft", "{deleted-member-invalid")

            executeRetirement(connection, FIRST_SHA)

            assertEquals(0, count(connection, "SELECT count(*) FROM public.member_attr WHERE name = ANY (?)", retiredNames))
            assertEquals(draft, attrValue(connection, 1, "profileWorkspaceDraft"))
            assertEquals(published, attrValue(connection, 1, "profileWorkspacePublished"))
            assertEquals("keep", attrValue(connection, 1, "unrelated"))
            assertEquals("{deleted-member-invalid", attrValue(connection, 2, "profileWorkspaceDraft"))
            assertEquals(FIRST_SHA, markerSha(connection))
        }
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "partial",
            "blank",
            "invalid-json",
            "noncanonical",
            "invalid-service",
            "invalid-section",
            "invalid-project",
            "invalid-contact",
        ],
    )
    fun `invalid active workspace rolls back legacy deletion and marker creation`(failure: String) {
        postgres.createConnection("").use { connection ->
            insertMember(connection, 1, deleted = false)
            val canonical = canonicalWorkspace("profile.png", "Backend engineer")
            insertAttr(connection, 1, "profileWorkspaceDraft", canonical)
            when (failure) {
                "partial" -> Unit
                "blank" -> insertAttr(connection, 1, "profileWorkspacePublished", "   ")
                "invalid-json" -> insertAttr(connection, 1, "profileWorkspacePublished", "{invalid")
                "noncanonical" ->
                    insertAttr(
                        connection,
                        1,
                        "profileWorkspacePublished",
                        canonical.replace("Backend engineer", " Backend engineer "),
                    )

                "invalid-service" ->
                    insertAttr(
                        connection,
                        1,
                        "profileWorkspacePublished",
                        canonical.replace(
                            "\"serviceLinks\":[{\"icon\":\"service\"",
                            "\"serviceLinks\":[{\"icon\":\"unsupported\"",
                        ),
                    )

                "invalid-section" ->
                    insertAttr(
                        connection,
                        1,
                        "profileWorkspacePublished",
                        canonical.replace("\"items\":[\"Built APIs\"]", "\"items\":[\" \"]"),
                    )

                "invalid-project" ->
                    insertAttr(
                        connection,
                        1,
                        "profileWorkspacePublished",
                        canonical.replace(
                            "\"href\":\"https://example.com\",\"linkLabel\":\"Project\"",
                            "\"href\":\"https://example.com\",\"linkLabel\":\"\"",
                        ),
                    )

                "invalid-contact" ->
                    insertAttr(
                        connection,
                        1,
                        "profileWorkspacePublished",
                        canonical.replace(
                            "\"contactLinks\":[{\"icon\":\"mail\"",
                            "\"contactLinks\":[{\"icon\":\"unsupported\"",
                        ),
                    )
            }
            insertAttr(connection, 1, "profileImgUrl", "must-remain-on-failure")

            assertFailsWith<SQLException> { executeRetirement(connection, FIRST_SHA) }
            rollbackFailedScript(connection)

            assertEquals("must-remain-on-failure", attrValue(connection, 1, "profileImgUrl"))
            assertEquals(0, count(connection, "SELECT count(*) FROM public.platform_schema_cutover"))
        }
    }

    @Test
    fun `replay preserves the first one-time marker`() {
        postgres.createConnection("").use { connection ->
            insertValidActiveMember(connection)
            insertAttr(connection, 1, "profileImgUrl", "retired")

            executeRetirement(connection, FIRST_SHA)
            executeRetirement(connection, LATER_SHA, FIRST_SHA)

            assertEquals(FIRST_SHA, markerSha(connection))
            assertEquals(0, count(connection, "SELECT count(*) FROM public.member_attr WHERE name = 'profileImgUrl'"))
        }
    }

    @Test
    fun `expected marker drift fails without replacing the first marker`() {
        postgres.createConnection("").use { connection ->
            insertValidActiveMember(connection)
            executeRetirement(connection, FIRST_SHA)

            assertFailsWith<SQLException> { executeRetirement(connection, LATER_SHA, LATER_SHA) }
            rollbackFailedScript(connection)

            assertEquals(FIRST_SHA, markerSha(connection))
        }
    }

    @Test
    fun `reintroduced retired attr fails before delete and remains observable`() {
        postgres.createConnection("").use { connection ->
            insertValidActiveMember(connection)
            executeRetirement(connection, FIRST_SHA)
            insertAttr(connection, 1, "profileRole", "reintroduced")

            assertFailsWith<SQLException> { executeRetirement(connection, LATER_SHA, FIRST_SHA) }
            rollbackFailedScript(connection)

            assertEquals("reintroduced", attrValue(connection, 1, "profileRole"))
            assertEquals(FIRST_SHA, markerSha(connection))
        }
    }

    private fun insertValidActiveMember(connection: Connection) {
        insertMember(connection, 1, deleted = false)
        insertAttr(connection, 1, "profileWorkspaceDraft", canonicalWorkspace("draft.png", "Draft role"))
        insertAttr(connection, 1, "profileWorkspacePublished", canonicalWorkspace("published.png", "Published role"))
    }

    private fun insertMember(
        connection: Connection,
        id: Long,
        deleted: Boolean,
    ) {
        connection.prepareStatement("INSERT INTO public.member (id, deleted_at) VALUES (?, CASE WHEN ? THEN now() ELSE NULL END)").use {
            it.setLong(1, id)
            it.setBoolean(2, deleted)
            it.executeUpdate()
        }
    }

    private fun insertAttr(
        connection: Connection,
        memberId: Long,
        name: String,
        value: String,
    ) {
        connection.prepareStatement("INSERT INTO public.member_attr (subject_id, name, str_value) VALUES (?, ?, ?)").use {
            it.setLong(1, memberId)
            it.setString(2, name)
            it.setString(3, value)
            it.executeUpdate()
        }
    }

    private fun executeRetirement(
        connection: Connection,
        sourceSha: String,
        expectedMarkerSha: String = sourceSha,
    ) {
        connection.createStatement().use { statement -> statement.execute(executableRetirementSql(sourceSha, expectedMarkerSha)) }
    }

    private fun rollbackFailedScript(connection: Connection) {
        connection.createStatement().use { statement -> statement.execute("ROLLBACK") }
    }

    private fun markerSha(connection: Connection): String =
        connection.createStatement().use { statement ->
            statement
                .executeQuery(
                    "SELECT source_sha FROM public.platform_schema_cutover WHERE cutover_id = 'profile-workspace-legacy-attrs'",
                ).use { result ->
                    assertTrue(result.next())
                    result.getString(1)
                }
        }

    private fun attrValue(
        connection: Connection,
        memberId: Long,
        name: String,
    ): String? =
        connection.prepareStatement("SELECT str_value FROM public.member_attr WHERE subject_id = ? AND name = ?").use {
            it.setLong(1, memberId)
            it.setString(2, name)
            it.executeQuery().use { result -> if (result.next()) result.getString(1) else null }
        }

    private fun count(
        connection: Connection,
        sql: String,
        names: List<String>? = null,
    ): Int =
        connection.prepareStatement(sql).use { statement ->
            if (names != null) {
                statement.setArray(1, connection.createArrayOf("text", names.toTypedArray()))
            }
            statement.executeQuery().use { result ->
                assertTrue(result.next())
                result.getInt(1)
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
                            id = "section",
                            title = "Experience",
                            items = listOf("Built APIs"),
                        ),
                    ),
                aboutProjects =
                    listOf(
                        MemberProfileAboutProjectBlock(
                            id = "project",
                            name = "Project",
                            summary = "Canonical workspace",
                            role = "Engineer",
                            href = "https://example.com",
                            linkLabel = "Project",
                        ),
                    ),
                serviceLinks =
                    listOf(
                        MemberProfileLinkItem(
                            icon = "service",
                            label = "Source code",
                            href = "https://github.com/AquilaXk/aquila-blog",
                        ),
                    ),
                contactLinks =
                    listOf(
                        MemberProfileLinkItem(
                            icon = "mail",
                            label = "Email",
                            href = "mailto:admin@example.com",
                        ),
                    ),
            ),
        )

    private fun productionMigration(): String =
        Path.of("src/main/resources/db/migration/V20260903_03__create_platform_schema_cutover.sql").toFile().readText()

    private fun testMigration(): String =
        Path.of("src/main/resources/db/migration-test/V20260903_03__create_platform_schema_cutover.sql").toFile().readText()

    private fun executableRetirementSql(
        sourceSha: String,
        expectedMarkerSha: String,
    ): String =
        Path
            .of("..", "deploy", "homeserver", "sql", "retire_profile_workspace_legacy.sql")
            .toFile()
            .readLines()
            .filterNot { it.startsWith("\\") }
            .joinToString("\n")
            .replace(":'cutover_sha'", "'$sourceSha'")
            .replace(":'expected_marker_sha'", "'$expectedMarkerSha'")
            .replace(" AS configured_cutover_sha \\gset", ";")
            .replace(" AS configured_expected_marker_sha \\gset", ";")
}
