package com.back.infrastructure

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.flywaydb.core.Flyway
import org.flywaydb.database.postgresql.PostgreSQLConfigurationExtension
import org.junit.jupiter.api.Assertions.assertTimeoutPreemptively
import org.junit.jupiter.api.MethodOrderer
import org.junit.jupiter.api.Order
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestMethodOrder
import org.junit.jupiter.api.function.ThrowingSupplier
import org.junit.jupiter.api.io.TempDir
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import org.yaml.snakeyaml.Yaml
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.SQLException
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@Testcontainers(disabledWithoutDocker = true)
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
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
    @Order(1)
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
    @Order(2)
    fun `flyway migration is idempotent and pgroonga extension remains enabled`() {
        flyway().migrate()
        val second = flyway().migrate()
        assertEquals(0, second.migrationsExecuted)

        postgres.createConnection("").use { conn ->
            assertTrue(hasExtension(conn, "pgroonga"))
        }
    }

    @Test
    @Order(3)
    fun `production concurrent operational index migration rebuilds invalid remnant without advisory lock self deadlock`(
        @TempDir concurrentDir: Path,
    ) {
        flyway().migrate()
        createInvalidRemnantIndex()
        postgres.createConnection("").use { conn ->
            val (indisvalid, _) = indexState(conn, "post_idx_public_listed_active_created_at_id_desc")
            assertFalse(indisvalid)
        }

        val migrationFileName = "V20261114_01__add_missing_operational_indexes_concurrently.sql"
        val migrationSourceDir = Path.of("src/main/resources/db/migration")
        Files.copy(migrationSourceDir.resolve(migrationFileName), concurrentDir.resolve(migrationFileName))
        Files.copy(
            migrationSourceDir.resolve("$migrationFileName.conf"),
            concurrentDir.resolve("$migrationFileName.conf"),
        )

        val transactionalLock = readProdTransactionalLock()
        val hikariConfig =
            HikariConfig().apply {
                jdbcUrl = postgres.jdbcUrl
                username = postgres.username
                password = postgres.password
                isAutoCommit = false
                maximumPoolSize = 4
            }

        HikariDataSource(hikariConfig).use { dataSource ->
            val flywayConfig =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/migration-test", "filesystem:$concurrentDir")
                    .baselineOnMigrate(true)
                    .validateOnMigrate(true)
                    .apply {
                        getConfigurationExtension(PostgreSQLConfigurationExtension::class.java)
                            .isTransactionalLock = transactionalLock
                    }
            val result =
                assertTimeoutPreemptively(
                    Duration.ofSeconds(10),
                    ThrowingSupplier {
                        flywayConfig.load().migrate()
                    },
                )
            assertEquals(1, result.migrationsExecuted)
            assertEquals("20261114.01", result.targetSchemaVersion)
        }

        val expectedIndexes =
            listOf(
                "post_idx_public_listed_active_created_at_id_desc",
                "post_idx_public_listed_active_hit_count_id_desc",
                "post_idx_public_listed_active_likes_count_id_desc",
                "post_idx_active_modified_at_id_desc",
                "post_tag_index_idx_tag_lower_post_id",
                "post_attr_idx_name_modified_at_desc",
                "member_session_idx_revoked_at_id_asc",
                "cloud_file_idx_owner_active_created_id_desc",
                "cloud_file_idx_active_object_key_pattern",
                "cloud_video_upload_session_idx_status_modified_id",
            )
        postgres.createConnection("").use { conn ->
            expectedIndexes.forEach { indexName ->
                val (indisvalid, indisready) = indexState(conn, indexName)
                assertTrue(indisvalid, "Expected index $indexName to be indisvalid=true")
                assertTrue(indisready, "Expected index $indexName to be indisready=true")
            }
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

    private fun readProdTransactionalLock(): Boolean {
        val root = Yaml().load<Map<String, Any>>(Files.readString(Path.of("src/main/resources/application-prod.yaml")))
        val spring = root["spring"] as? Map<*, *>
        val flyway = spring?.get("flyway") as? Map<*, *>
        val postgresql = flyway?.get("postgresql") as? Map<*, *>
        return postgresql?.get("transactional-lock") as? Boolean ?: true
    }

    private fun createInvalidRemnantIndex() {
        postgres.createConnection("").use { blocker ->
            blocker.transactionIsolation = Connection.TRANSACTION_REPEATABLE_READ
            blocker.autoCommit = false
            blocker.createStatement().use { stmt ->
                stmt.execute("SELECT 1 FROM public.post LIMIT 1")
            }
            postgres.createConnection("").use { ddlConn ->
                ddlConn.autoCommit = true
                ddlConn.createStatement().use { stmt ->
                    stmt.execute("SET statement_timeout = '150ms'")
                    val timedOut =
                        try {
                            stmt.execute(
                                """
                                CREATE INDEX CONCURRENTLY post_idx_public_listed_active_created_at_id_desc
                                    ON public.post (created_at DESC, id DESC)
                                    WHERE deleted_at IS NULL AND published IS TRUE AND listed IS TRUE
                                """.trimIndent(),
                            )
                            false
                        } catch (_: SQLException) {
                            true
                        }
                    stmt.execute("RESET statement_timeout")
                    assertTrue(timedOut, "Expected CONCURRENTLY index build to abort while snapshot is held")
                }
            }
            blocker.rollback()
        }
    }

    private fun indexState(
        conn: Connection,
        indexName: String,
    ): Pair<Boolean, Boolean> =
        conn
            .prepareStatement(
                """
                SELECT i.indisvalid, i.indisready
                FROM pg_index i
                JOIN pg_class c ON c.oid = i.indexrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = ?
                """.trimIndent(),
            ).use { stmt ->
                stmt.setString(1, indexName)
                stmt.executeQuery().use { rs ->
                    check(rs.next()) { "Missing index in pg_index: $indexName" }
                    rs.getBoolean("indisvalid") to rs.getBoolean("indisready")
                }
            }
}
