package com.back.infrastructure

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.sql.Connection
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@Testcontainers(disabledWithoutDocker = true)
class FlywayTestcontainersIntegrationTest {
    companion object {
        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName.parse("jangka512/pgj:latest").asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_testcontainers")
                withUsername("postgres")
                withPassword("postgres")
            }
    }

    private fun flyway(): Flyway =
        Flyway
            .configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .locations("classpath:db/migration-test")
            .baselineOnMigrate(true)
            .validateOnMigrate(true)
            .load()

    @Test
    fun `fresh postgres container applies flyway baseline and creates core tables`() {
        val result = flyway().migrate()
        assertTrue(result.migrationsExecuted >= 1)

        postgres.createConnection("").use { conn ->
            assertTrue(hasTable(conn, "member"))
            assertTrue(hasTable(conn, "post"))
            assertTrue(hasTable(conn, "task"))
            assertTrue(hasTable(conn, "uploaded_file"))
        }
    }

    @Test
    fun `flyway migration is idempotent and pgroonga extension remains enabled`() {
        flyway().migrate()
        val second = flyway().migrate()
        assertEquals(0, second.migrationsExecuted)

        postgres.createConnection("").use { conn ->
            assertTrue(hasExtension(conn, "pgroonga"))
        }
    }

    private fun hasTable(
        conn: Connection,
        tableName: String,
    ): Boolean =
        conn
            .prepareStatement(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = ?
                )
                """.trimIndent(),
            ).use { stmt ->
                stmt.setString(1, tableName)
                stmt.executeQuery().use { rs ->
                    rs.next()
                    rs.getBoolean(1)
                }
            }

    private fun hasExtension(
        conn: Connection,
        extensionName: String,
    ): Boolean =
        conn
            .prepareStatement(
                """
                SELECT EXISTS (
                    SELECT 1 FROM pg_extension WHERE extname = ?
                )
                """.trimIndent(),
            ).use { stmt ->
                stmt.setString(1, extensionName)
                stmt.executeQuery().use { rs ->
                    rs.next()
                    rs.getBoolean(1)
                }
            }
}
