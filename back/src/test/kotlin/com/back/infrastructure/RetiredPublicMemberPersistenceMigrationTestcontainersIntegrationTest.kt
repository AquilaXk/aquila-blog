package com.back.infrastructure

import org.flywaydb.core.Flyway
import org.flywaydb.core.api.FlywayException
import org.flywaydb.core.api.MigrationVersion
import org.junit.jupiter.api.Test
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.sql.Connection
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@Testcontainers(disabledWithoutDocker = true)
class RetiredPublicMemberPersistenceMigrationTestcontainersIntegrationTest {
    companion object {
        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName.parse("jangka512/pgj:latest").asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_retired_public_persistence")
                withUsername("postgres")
                withPassword("postgres")
            }

        private val targetTables =
            listOf(
                "member_signup_verification",
                "pending_oauth_signup",
                "member_privacy_request",
                "member_notification",
                "post_comment",
            )
        private val targetSequences = targetTables.map { "${it}_seq" }
        private val retainedTables = listOf("member_legal_acceptance", "member_account_deletion")
        private val retainedSequences = retainedTables.map { "${it}_seq" }
    }

    @Test
    fun `migration fails closed before removing only retired public persistence`() {
        migrateToPreviousVersion()

        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.executeUpdate(
                    """
                    INSERT INTO pending_oauth_signup (
                        id, created_at, modified_at, provider, provider_subject_hash,
                        member_login_id, pending_token_hash, pending_token_expires_at, nickname
                    ) VALUES (
                        1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'test', 'provider-hash',
                        'retired-applicant', 'token-hash', CURRENT_TIMESTAMP + INTERVAL '5 minutes', 'retired'
                    )
                    """.trimIndent(),
                )
            }
        }

        val rowFailure = assertFailsWith<FlywayException> { migrate() }
        assertContains(causalMessages(rowFailure), "retired public persistence row preflight failed")
        postgres.createConnection("").use { connection ->
            targetTables.forEach { assertTrue(hasRelation(connection, it, "r"), "$it must survive rollback") }
            connection.createStatement().use { statement ->
                statement.executeUpdate("DELETE FROM pending_oauth_signup WHERE id = 1")
                statement.execute(
                    """
                    CREATE TABLE retired_public_persistence_dependency_probe (
                        verification_id BIGINT REFERENCES member_signup_verification(id)
                    )
                    """.trimIndent(),
                )
            }
        }

        val dependencyFailure = assertFailsWith<FlywayException> { migrate() }
        assertContains(causalMessages(dependencyFailure), "retired public persistence dependency preflight failed")
        postgres.createConnection("").use { connection ->
            targetTables.forEach { assertTrue(hasRelation(connection, it, "r"), "$it must survive rollback") }
            connection.createStatement().use { statement ->
                statement.execute("DROP TABLE retired_public_persistence_dependency_probe")
            }
        }

        assertEquals(1, migrate().migrationsExecuted)
        postgres.createConnection("").use { connection ->
            targetTables.forEach { assertFalse(hasRelation(connection, it, "r"), "$it must be removed") }
            targetSequences.forEach { assertFalse(hasRelation(connection, it, "S"), "$it must be removed") }
            retainedTables.forEach { assertTrue(hasRelation(connection, it, "r"), "$it must remain") }
            retainedSequences.forEach { assertTrue(hasRelation(connection, it, "S"), "$it must remain") }
        }
        assertEquals(0, migrate().migrationsExecuted)
    }

    private fun migrate() =
        Flyway
            .configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .locations("classpath:db/migration-test")
            .baselineOnMigrate(true)
            .validateOnMigrate(true)
            .load()
            .migrate()

    private fun migrateToPreviousVersion() {
        Flyway
            .configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .locations("classpath:db/migration-test")
            .target(MigrationVersion.fromVersion("20260829.01"))
            .baselineOnMigrate(true)
            .validateOnMigrate(true)
            .load()
            .migrate()
    }

    private fun hasRelation(
        connection: Connection,
        relationName: String,
        relationKind: String,
    ): Boolean =
        connection
            .prepareStatement(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_class AS relation
                    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
                    WHERE namespace.nspname = 'public'
                      AND relation.relname = ?
                      AND relation.relkind::TEXT = ?
                )
                """.trimIndent(),
            ).use { statement ->
                statement.setString(1, relationName)
                statement.setString(2, relationKind)
                statement.executeQuery().use { result ->
                    result.next()
                    result.getBoolean(1)
                }
            }

    private fun causalMessages(error: Throwable): String =
        generateSequence(error) { it.cause }
            .mapNotNull { it.message }
            .joinToString("\n")
}
