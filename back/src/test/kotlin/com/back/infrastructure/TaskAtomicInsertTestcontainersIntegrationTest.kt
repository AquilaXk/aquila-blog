package com.back.infrastructure

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
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
            statement.setString(6, "PENDING")
            statement.setInt(7, 0)
            statement.setInt(8, 3)
            statement.setTimestamp(9, Timestamp.from(Instant.parse("2026-08-11T00:00:00Z")))
            statement.setNull(10, Types.VARCHAR)
            statement.setNull(11, Types.OTHER)
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
