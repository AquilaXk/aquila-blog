package com.back.infrastructure

import org.flywaydb.core.Flyway
import org.flywaydb.core.api.MigrationVersion
import org.junit.jupiter.api.MethodOrderer
import org.junit.jupiter.api.Order
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestMethodOrder
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.sql.Connection
import java.sql.Timestamp
import java.sql.Types
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@Testcontainers(disabledWithoutDocker = true)
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
class TaskAtomicInsertTestcontainersIntegrationTest {
    companion object {
        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName.parse("jangka512/pgj:latest").asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_task_atomic_insert")
                withUsername("postgres")
                withPassword("postgres")
            }
    }

    @Test
    @Order(1)
    fun `pre envelope failed row migrates to exact v1 envelope and bounded retention`() {
        migrateToPreviousVersion()
        val taskUid = UUID.randomUUID()
        val rawPayload = """{"uid":"$taskUid","aggregateType":"Post","aggregateId":77,"value":"private"}"""

        postgres.createConnection("").use { connection ->
            connection
                .prepareStatement(
                    """
                    INSERT INTO task (
                        uid, aggregate_type, aggregate_id, task_type, payload, status,
                        retry_count, max_retries, next_retry_at, created_at, modified_at
                    ) VALUES (?, 'Post', 77, 'post.interaction.side-effect', ?, 'FAILED', 3, 3, ?, ?, ?)
                    """.trimIndent(),
                ).use { statement ->
                    val createdAt = Timestamp.from(Instant.parse("2026-08-10T00:00:00Z"))
                    statement.setObject(1, taskUid)
                    statement.setString(2, rawPayload)
                    statement.setTimestamp(3, createdAt)
                    statement.setTimestamp(4, createdAt)
                    statement.setTimestamp(5, createdAt)
                    assertEquals(1, statement.executeUpdate())
                }
        }

        migrate()

        postgres.createConnection("").use { connection ->
            connection
                .prepareStatement(
                    """
                    SELECT
                        payload::jsonb ->> 'schemaVersion',
                        payload::jsonb ->> 'taskType',
                        payload::jsonb ->> 'sensitivity',
                        payload::jsonb ->> 'payloadJson',
                        payload_purge_after,
                        payload_redacted_at,
                        row_purge_after
                    FROM task
                    WHERE uid = ?
                    """.trimIndent(),
                ).use { statement ->
                    statement.setObject(1, taskUid)
                    statement.executeQuery().use { result ->
                        assertTrue(result.next())
                        assertEquals("1", result.getString(1))
                        assertEquals("post.interaction.side-effect", result.getString(2))
                        assertEquals("PERSONAL", result.getString(3))
                        assertEquals(rawPayload, result.getString(4))
                        assertEquals(Instant.parse("2026-08-17T00:00:00Z"), result.getTimestamp(5).toInstant())
                        assertEquals(null, result.getTimestamp(6))
                        assertEquals(Instant.parse("2026-09-09T00:00:00Z"), result.getTimestamp(7).toInstant())
                    }
                }
        }
    }

    @Test
    @Order(2)
    fun `same uid insert is atomic and duplicate transaction remains usable`() {
        migrate()
        val insertSql = productionAtomicInsertSql()
        val sharedUid = UUID.randomUUID()
        val duplicateTransactionMarkerUid = UUID.randomUUID()
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)

        Executors.newFixedThreadPool(2).use { executor ->
            val results =
                List(2) {
                    executor.submit<InsertResult> {
                        postgres.createConnection("").use { connection ->
                            connection.autoCommit = false
                            ready.countDown()
                            check(start.await(10, TimeUnit.SECONDS)) { "concurrent insert start timed out" }

                            val sharedInsertCount = insert(connection, insertSql, sharedUid)
                            val markerInsertCount =
                                if (sharedInsertCount == 0) {
                                    insert(connection, insertSql, duplicateTransactionMarkerUid)
                                } else {
                                    0
                                }
                            connection.commit()
                            InsertResult(sharedInsertCount, markerInsertCount)
                        }
                    }
                }

            assertTrue(ready.await(10, TimeUnit.SECONDS), "concurrent workers did not become ready")
            start.countDown()
            val outcomes = results.map { it.get(20, TimeUnit.SECONDS) }

            assertEquals(listOf(0, 1), outcomes.map(InsertResult::sharedInsertCount).sorted())
            assertEquals(1, outcomes.sumOf(InsertResult::markerInsertCount))
        }

        postgres.createConnection("").use { connection ->
            assertEquals(1, countByUid(connection, sharedUid))
            assertEquals(1, countByUid(connection, duplicateTransactionMarkerUid))
        }
    }

    private fun migrate() {
        Flyway
            .configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .locations("classpath:db/migration-test")
            .baselineOnMigrate(true)
            .validateOnMigrate(true)
            .load()
            .migrate()
    }

    private fun migrateToPreviousVersion() {
        Flyway
            .configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .locations("classpath:db/migration-test")
            .target(MigrationVersion.fromVersion("20260801.01"))
            .baselineOnMigrate(true)
            .validateOnMigrate(true)
            .load()
            .migrate()
    }

    private fun productionAtomicInsertSql(): String {
        val sqlType =
            runCatching {
                Class.forName("com.back.global.task.adapter.persistence.TaskAtomicInsertSql")
            }.getOrNull()
        assertNotNull(sqlType, "production TaskAtomicInsertSql must define the atomic insert statement")

        val instance = sqlType.getField("INSTANCE").get(null)
        return sqlType.getMethod("statement").invoke(instance) as String
    }

    private fun insert(
        connection: Connection,
        sql: String,
        uid: UUID,
    ): Int =
        connection.prepareStatement(sql).use { statement ->
            statement.setObject(1, uid)
            statement.setString(2, "Post")
            statement.setLong(3, 1L)
            statement.setString(4, "test.atomic-insert")
            statement.setString(5, "{}")
            statement.setNull(6, Types.TIMESTAMP_WITH_TIMEZONE)
            statement.setString(7, "PENDING")
            statement.setInt(8, 0)
            statement.setInt(9, 3)
            statement.setTimestamp(10, Timestamp.from(Instant.parse("2026-08-11T00:00:00Z")))
            statement.setNull(11, Types.VARCHAR)
            statement.setNull(12, Types.OTHER)
            statement.executeUpdate()
        }

    private fun countByUid(
        connection: Connection,
        uid: UUID,
    ): Int =
        connection.prepareStatement("SELECT COUNT(*) FROM task WHERE uid = ?").use { statement ->
            statement.setObject(1, uid)
            statement.executeQuery().use { result ->
                result.next()
                result.getInt(1)
            }
        }

    private data class InsertResult(
        val sharedInsertCount: Int,
        val markerInsertCount: Int,
    )
}
