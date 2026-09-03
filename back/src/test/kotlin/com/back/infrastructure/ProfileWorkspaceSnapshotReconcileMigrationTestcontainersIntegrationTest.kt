package com.back.infrastructure

import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileAboutSectionBlock
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.domain.shared.memberMixin.decodeMemberProfileWorkspaceContent
import com.back.boundedContexts.member.domain.shared.memberMixin.encodeMemberProfileWorkspaceContent
import com.back.standard.util.Ut
import org.flywaydb.core.Flyway
import org.flywaydb.core.api.FlywayException
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import kotlin.system.measureTimeMillis
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

@Testcontainers(disabledWithoutDocker = true)
class ProfileWorkspaceSnapshotReconcileMigrationTestcontainersIntegrationTest {
    companion object {
        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName
                    .parse("jangka512/pgj@sha256:a8bfcb8e5c64805429cd1406d0840ba1c13f70830e73d9f5e4a63cd7c1b62da7")
                    .asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_profile_workspace_reconcile")
                withUsername("postgres")
                withPassword("postgres")
            }
    }

    @BeforeEach
    fun resetSchema() {
        Ut.JSON.objectMapper = jacksonObjectMapper()
        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("DROP TABLE IF EXISTS flyway_schema_history")
                statement.execute("DROP TABLE IF EXISTS member_attr")
                statement.execute("DROP TABLE IF EXISTS member")
                statement.execute("DROP SEQUENCE IF EXISTS member_attr_seq")
                statement.execute("CREATE SEQUENCE member_attr_seq START 1")
                statement.execute("CREATE TABLE member (id BIGINT PRIMARY KEY, deleted_at TIMESTAMPTZ)")
                statement.execute(
                    """
                    CREATE TABLE member_attr (
                        id BIGINT NOT NULL DEFAULT nextval('member_attr_seq'),
                        subject_id BIGINT NOT NULL REFERENCES member(id),
                        name TEXT NOT NULL,
                        str_value TEXT,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE (subject_id, name)
                    )
                    """.trimIndent(),
                )
            }
        }
    }

    @Test
    fun `reconciles missing pairs from legacy projection without changing canonical or legacy rows`() {
        postgres.createConnection("").use { connection ->
            insertMembers(connection, 1L..7L)
            val existingDraft = workspace("existing-draft", "draft role")
            val existingPublished = workspace("existing-published", "published role")
            insertAttr(connection, 1, "profileWorkspaceDraft", existingDraft, Instant.parse("2026-09-01T01:00:00Z"))
            insertAttr(connection, 1, "profileWorkspacePublished", existingPublished, Instant.parse("2026-09-01T02:00:00Z"))
            insertAttr(connection, 2, "profileWorkspaceDraft", existingDraft, Instant.parse("2026-09-01T03:00:00Z"))
            insertAttr(connection, 2, "profileWorkspacePublished", existingPublished, Instant.parse("2026-09-01T04:00:00Z"))
            insertLegacy(connection, 3, "material-3")
            insertLegacy(connection, 4, "material-4")
            insertAttr(connection, 7, "profileRole", "deleted legacy")

            val existingBefore = workspaceRows(connection, 1)
            val legacyBefore = legacyAttrs(connection, 3)
            assertEquals(1, executeMigration())

            assertEquals(12, workspaceCount(connection))
            assertEquals(existingBefore, workspaceRows(connection, 1))
            assertEquals(legacyBefore, legacyAttrs(connection, 3))
            assertEquals(expectedLegacyWorkspaceJson("material-3"), rawWorkspace(connection, 3, "profileWorkspaceDraft"))
            assertEquals(profileFromLegacy("material-3"), decodedWorkspace(connection, 3, "profileWorkspaceDraft"))
            assertEquals(profileFromLegacy("material-3"), decodedWorkspace(connection, 3, "profileWorkspacePublished"))
            assertEquals(profileFromLegacy("material-4"), decodedWorkspace(connection, 4, "profileWorkspaceDraft"))
            assertEquals(MemberProfileWorkspaceContent(), decodedWorkspace(connection, 5, "profileWorkspaceDraft"))
            assertEquals(MemberProfileWorkspaceContent(), decodedWorkspace(connection, 6, "profileWorkspacePublished"))
            assertNull(rawWorkspace(connection, 7, "profileWorkspaceDraft"))
            assertEquals("JDBC", migrationType(connection, "20260903.02"))
        }
    }

    @Test
    fun `rejects partial blank and invalid persisted pairs before any insert`() {
        listOf(
            mapOf("profileWorkspaceDraft" to workspace("one", "role")),
            mapOf("profileWorkspaceDraft" to "   ", "profileWorkspacePublished" to workspace("two", "role")),
            mapOf("profileWorkspaceDraft" to "{bad json", "profileWorkspacePublished" to workspace("three", "role")),
            mapOf(
                "profileWorkspaceDraft" to noncanonicalWorkspace(),
                "profileWorkspacePublished" to noncanonicalWorkspace(),
            ),
        ).forEach { invalidPair ->
            resetSchema()
            postgres.createConnection("").use { connection ->
                insertMembers(connection, 1L..2L)
                invalidPair.forEach { (name, raw) -> insertAttr(connection, 1, name, raw) }
                insertLegacy(connection, 2, "would-have-inserted")
                val memberOneBefore = workspaceRows(connection, 1)
                val memberTwoBefore = workspaceRows(connection, 2)

                assertFailsWith<FlywayException> { executeMigration() }
                assertEquals(memberOneBefore, workspaceRows(connection, 1))
                assertEquals(memberTwoBefore, workspaceRows(connection, 2))
            }
        }
    }

    @Test
    fun `repeated execution is a no-op after all pairs become canonical`() {
        postgres.createConnection("").use { connection ->
            insertMembers(connection, 1L..2L)
            insertLegacy(connection, 1, "material")
            assertEquals(1, executeMigration())
            val before = workspaceRows(connection, 1)
            assertEquals(0, executeMigration())

            assertEquals(4, workspaceCount(connection))
            assertEquals(before, workspaceRows(connection, 1))
        }
    }

    @Test
    fun `bounded lock failure leaves profile rows unchanged`() {
        postgres.createConnection("").use { seedConnection ->
            insertMembers(seedConnection, 1L..1L)
            insertLegacy(seedConnection, 1, "locked")
            val before = attrs(seedConnection, 1)

            postgres.createConnection("").use { lockConnection ->
                lockConnection.autoCommit = false
                lockConnection.createStatement().use { statement ->
                    statement.execute("LOCK TABLE member_attr IN ACCESS EXCLUSIVE MODE")
                }
                val elapsed =
                    measureTimeMillis {
                        assertFailsWith<FlywayException> { executeMigration() }
                    }
                lockConnection.rollback()

                assertTrue(elapsed in 4_000..15_000, "lock timeout was not bounded: ${elapsed}ms")
                assertEquals(before, attrs(seedConnection, 1))
                assertEquals(0, workspaceCount(seedConnection))
            }
        }
    }

    private fun executeMigration(): Int =
        Flyway
            .configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .locations("classpath:db/migration")
            .sqlMigrationSuffixes(".disabled")
            .baselineOnMigrate(true)
            .baselineVersion("20260903.01")
            .target("20260903.02")
            .validateOnMigrate(true)
            .load()
            .migrate()
            .migrationsExecuted

    private fun migrationType(
        connection: Connection,
        version: String,
    ): String? =
        connection.prepareStatement("SELECT type FROM flyway_schema_history WHERE version = ? AND success").use { statement ->
            statement.setString(1, version)
            statement.executeQuery().use { rows -> if (rows.next()) rows.getString(1) else null }
        }

    private fun insertMembers(
        connection: Connection,
        ids: LongRange,
    ) {
        connection.prepareStatement("INSERT INTO member (id, deleted_at) VALUES (?, ?)").use { statement ->
            ids.forEach { id ->
                statement.setLong(1, id)
                if (id ==
                    7L
                ) {
                    statement.setTimestamp(2, Timestamp.from(Instant.parse("2026-09-01T00:00:00Z")))
                } else {
                    statement.setNull(2, java.sql.Types.TIMESTAMP_WITH_TIMEZONE)
                }
                statement.executeUpdate()
            }
        }
    }

    private fun insertLegacy(
        connection: Connection,
        memberId: Long,
        suffix: String,
    ) {
        insertAttr(connection, memberId, "profileImgUrl", " https://img.example/$suffix ")
        insertAttr(connection, memberId, "profileRole", " role $suffix ")
        insertAttr(connection, memberId, "profileBio", " bio $suffix ")
        insertAttr(connection, memberId, "aboutRole", " about role ")
        insertAttr(connection, memberId, "aboutBio", " about bio ")
        insertAttr(connection, memberId, "aboutDetails", "About\n- Item $suffix\nNotes\n- Note")
        insertAttr(connection, memberId, "blogTitle", " Blog $suffix ")
        insertAttr(connection, memberId, "homeIntroTitle", " Hello ")
        insertAttr(connection, memberId, "homeIntroDescription", " Description ")
        insertAttr(connection, memberId, "blogDesign", "GRID")
        insertAttr(connection, memberId, "legacyBlogScheme", "LIGHT")
        insertAttr(
            connection,
            memberId,
            "profileServiceLinks",
            "{\"items\":[{\"icon\":\"bad\",\"label\":\" Source \",\"href\":\"https://example.com/$suffix\"}]}",
        )
        insertAttr(
            connection,
            memberId,
            "profileContactLinks",
            "{\"items\":[{\"icon\":\"mail\",\"label\":\" Mail \",\"href\":\"mailto:$suffix@example.com\"}]}",
        )
    }

    private fun insertAttr(
        connection: Connection,
        memberId: Long,
        name: String,
        value: String,
        timestamp: Instant? = null,
    ) {
        connection
            .prepareStatement(
                "INSERT INTO member_attr (subject_id, name, str_value, created_at, modified_at) VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))",
            ).use { statement ->
                statement.setLong(1, memberId)
                statement.setString(2, name)
                statement.setString(3, value)
                statement.setTimestamp(4, timestamp?.let(Timestamp::from))
                statement.setTimestamp(5, timestamp?.let(Timestamp::from))
                assertEquals(1, statement.executeUpdate())
            }
    }

    private fun workspace(
        image: String,
        role: String,
    ): String = encodeMemberProfileWorkspaceContent(MemberProfileWorkspaceContent(profileImageUrl = image, profileRole = role))

    private fun profileFromLegacy(suffix: String): MemberProfileWorkspaceContent =
        MemberProfileWorkspaceContent(
            profileImageUrl = "https://img.example/$suffix",
            profileRole = "role $suffix",
            profileBio = "bio $suffix",
            aboutRole = "about role",
            aboutBio = "about bio",
            aboutSections =
                listOf(
                    MemberProfileAboutSectionBlock("legacy-1", "About", listOf("Item $suffix")),
                    MemberProfileAboutSectionBlock("legacy-2", "Notes", listOf("Note")),
                ),
            blogTitle = "Blog $suffix",
            homeIntroTitle = "Hello",
            homeIntroDescription = "Description",
            blogDesign = "grid",
            legacyBlogScheme = "light",
            serviceLinks = listOf(MemberProfileLinkItem("service", "Source", "https://example.com/$suffix")),
            contactLinks = listOf(MemberProfileLinkItem("mail", "Mail", "mailto:$suffix@example.com")),
        )

    private fun expectedLegacyWorkspaceJson(suffix: String): String =
        """{"content":{"profileImageUrl":"https://img.example/$suffix","profileRole":"role $suffix","profileBio":"bio $suffix"""" +
            ""","aboutHeadline":"","aboutRole":"about role","aboutBio":"about bio","aboutSections":[""" +
            """{"id":"legacy-1","title":"About","items":["Item $suffix"],"dividerBefore":false},""" +
            """{"id":"legacy-2","title":"Notes","items":["Note"],"dividerBefore":false}],""" +
            """"aboutProjectSectionTitle":"","aboutProjects":[],"blogTitle":"Blog $suffix","homeIntroTitle":"Hello",""" +
            """"homeIntroDescription":"Description","blogDesign":"grid","legacyBlogScheme":"light","serviceLinks":[""" +
            """{"icon":"service","label":"Source","href":"https://example.com/$suffix"}],"contactLinks":[""" +
            """{"icon":"mail","label":"Mail","href":"mailto:$suffix@example.com"}]}}"""

    private fun noncanonicalWorkspace(): String =
        """{"content":{"profileImageUrl":" image ","profileRole":"role","profileBio":"","aboutHeadline":"",""" +
            """"aboutRole":"","aboutBio":"","aboutSections":[],"aboutProjectSectionTitle":"","aboutProjects":[],""" +
            """"blogTitle":"","homeIntroTitle":"","homeIntroDescription":"","blogDesign":"legacy",""" +
            """"legacyBlogScheme":"dark","serviceLinks":[],"contactLinks":[]}}"""

    private fun workspaceCount(connection: Connection): Int =
        count(connection, "SELECT count(*) FROM member_attr WHERE name IN ('profileWorkspaceDraft', 'profileWorkspacePublished')")

    private fun rawWorkspace(
        connection: Connection,
        memberId: Long,
        name: String,
    ): String? =
        connection.prepareStatement("SELECT str_value FROM member_attr WHERE subject_id = ? AND name = ?").use { statement ->
            statement.setLong(1, memberId)
            statement.setString(2, name)
            statement.executeQuery().use { rows -> if (rows.next()) rows.getString(1) else null }
        }

    private fun decodedWorkspace(
        connection: Connection,
        memberId: Long,
        name: String,
    ): MemberProfileWorkspaceContent =
        requireNotNull(decodeMemberProfileWorkspaceContent(requireNotNull(rawWorkspace(connection, memberId, name))))

    private fun workspaceRows(
        connection: Connection,
        memberId: Long,
    ): List<List<String>> =
        connection
            .prepareStatement(
                "SELECT name, str_value, created_at::text, modified_at::text FROM member_attr WHERE subject_id = ? AND name IN ('profileWorkspaceDraft', 'profileWorkspacePublished') ORDER BY name",
            ).use { statement ->
                statement.setLong(1, memberId)
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) {
                            add(
                                listOf(rows.getString(1), rows.getString(2), rows.getString(3), rows.getString(4)),
                            )
                        }
                    }
                }
            }

    private fun attrs(
        connection: Connection,
        memberId: Long,
    ): List<List<String>> =
        connection.prepareStatement("SELECT name, str_value FROM member_attr WHERE subject_id = ? ORDER BY name").use { statement ->
            statement.setLong(1, memberId)
            statement.executeQuery().use { rows -> buildList { while (rows.next()) add(listOf(rows.getString(1), rows.getString(2))) } }
        }

    private fun legacyAttrs(
        connection: Connection,
        memberId: Long,
    ): List<List<String>> =
        connection
            .prepareStatement(
                "SELECT name, str_value FROM member_attr WHERE subject_id = ? AND name NOT IN ('profileWorkspaceDraft', 'profileWorkspacePublished') ORDER BY name",
            ).use { statement ->
                statement.setLong(1, memberId)
                statement.executeQuery().use { rows ->
                    buildList { while (rows.next()) add(listOf(rows.getString(1), rows.getString(2))) }
                }
            }

    private fun count(
        connection: Connection,
        sql: String,
    ): Int =
        connection.createStatement().use { statement ->
            statement.executeQuery(sql).use { rows ->
                rows.next()
                rows.getInt(1)
            }
        }
}
