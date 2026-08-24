package com.back.infrastructure

import com.back.global.system.adapter.persistence.AdminOperationReceiptRepository
import com.back.global.task.adapter.persistence.TaskRepository
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.springframework.data.jpa.repository.Query
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.sql.Connection
import java.sql.Types
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@Testcontainers(disabledWithoutDocker = true)
class AdminOperationReceiptTestcontainersIntegrationTest {
    companion object {
        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName.parse("jangka512/pgj:latest").asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_admin_operation_receipt")
                withUsername("postgres")
                withPassword("postgres")
            }
    }

    @Test
    fun `admin operation migration admits one duplicate receipt and skip locked claim admits one task owner`() {
        migrate()
        postgres.createConnection("").use { connection ->
            assertTrue(hasColumn(connection, "admin_operation_receipt", "operation_id"))
            assertTrue(hasColumn(connection, "admin_operation_receipt", "result_code"))
        }

        assertDuplicateAdmissionKeepsLoserTransactionUsable()
        assertDifferentReceiptsClaimFailedTaskOnlyOnce()
    }

    private fun assertDuplicateAdmissionKeepsLoserTransactionUsable() {
        val sharedOperationId = UUID.randomUUID()
        val loserMarkerOperationId = UUID.randomUUID()
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)

        Executors.newFixedThreadPool(2).use { executor ->
            val results =
                List(2) {
                    executor.submit<AdmissionResult> {
                        postgres.createConnection("").use { connection ->
                            connection.autoCommit = false
                            ready.countDown()
                            check(start.await(10, TimeUnit.SECONDS)) { "concurrent admission start timed out" }

                            val sharedInsertCount = insertAdmission(connection, sharedOperationId)
                            val markerInsertCount = if (sharedInsertCount == 0) insertAdmission(connection, loserMarkerOperationId) else 0
                            connection.commit()
                            AdmissionResult(sharedInsertCount, markerInsertCount)
                        }
                    }
                }

            assertTrue(ready.await(10, TimeUnit.SECONDS), "concurrent admission workers did not become ready")
            start.countDown()
            val outcomes = results.map { it.get(20, TimeUnit.SECONDS) }

            assertEquals(listOf(0, 1), outcomes.map(AdmissionResult::sharedInsertCount).sorted())
            assertEquals(1, outcomes.sumOf(AdmissionResult::markerInsertCount))
        }
    }

    private fun assertDifferentReceiptsClaimFailedTaskOnlyOnce() {
        val firstOperationId = UUID.randomUUID()
        val secondOperationId = UUID.randomUUID()
        val taskUid = UUID.randomUUID()
        postgres.createConnection("").use { connection ->
            assertEquals(1, insertAdmission(connection, firstOperationId))
            assertEquals(1, insertAdmission(connection, secondOperationId))
            insertFailedTask(connection, taskUid)
        }

        val firstClaimed = CountDownLatch(1)
        val releaseFirstClaim = CountDownLatch(1)
        Executors.newFixedThreadPool(2).use { executor ->
            val first =
                executor.submit<List<Long>> {
                    postgres.createConnection("").use { connection ->
                        connection.autoCommit = false
                        val claimed = claimFailedTasks(connection)
                        firstClaimed.countDown()
                        check(releaseFirstClaim.await(10, TimeUnit.SECONDS)) { "first claim release timed out" }
                        connection.commit()
                        claimed
                    }
                }
            val second =
                executor.submit<List<Long>> {
                    check(firstClaimed.await(10, TimeUnit.SECONDS)) { "first claim was not acquired" }
                    postgres.createConnection("").use { connection ->
                        connection.autoCommit = false
                        val claimed = claimFailedTasks(connection)
                        connection.commit()
                        claimed
                    }
                }

            assertTrue(firstClaimed.await(10, TimeUnit.SECONDS), "first receipt did not claim the FAILED task")
            assertEquals(emptyList(), second.get(20, TimeUnit.SECONDS))
            releaseFirstClaim.countDown()
            assertEquals(1, first.get(20, TimeUnit.SECONDS).size)
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

    private fun insertAdmission(
        connection: Connection,
        operationId: UUID,
    ): Int =
        connection.prepareStatement(jdbcAdmissionSql()).use { statement ->
            statement.setObject(1, operationId)
            statement.setLong(2, 7L)
            statement.setNull(3, Types.BIGINT)
            statement.setString(4, "a".repeat(64))
            statement.setString(5, "TASK_DLQ_REPLAY")
            statement.setString(6, "post.write.side-effect")
            statement.setInt(7, 1)
            statement.setBoolean(8, true)
            statement.setString(9, "incident recovery")
            statement.executeUpdate()
        }

    private fun insertFailedTask(
        connection: Connection,
        taskUid: UUID,
    ) {
        connection
            .prepareStatement(
                """
                INSERT INTO task (
                    uid, aggregate_type, aggregate_id, task_type, payload, status,
                    retry_count, max_retries, next_retry_at, created_at, modified_at
                ) VALUES (
                    ?, 'Post', 1, 'post.write.side-effect', '{}', 'FAILED', 1, 3,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, taskUid)
                assertEquals(1, statement.executeUpdate())
            }
    }

    private fun claimFailedTasks(connection: Connection): List<Long> =
        connection.prepareStatement(jdbcFailedTaskClaimSql()).use { statement ->
            statement.setNull(1, Types.VARCHAR)
            statement.setNull(2, Types.VARCHAR)
            statement.setInt(3, 1)
            statement.executeQuery().use { result ->
                buildList {
                    while (result.next()) add(result.getLong("id"))
                }
            }
        }

    private fun jdbcAdmissionSql(): String =
        repositoryQuery(AdminOperationReceiptRepository::class.java, "insertIfAbsent")
            .replace(":operationId", "?")
            .replace(":actorId", "?")
            .replace(":sessionRowId", "?")
            .replace(":fingerprint", "?")
            .replace(":action", "?")
            .replace(":taskType", "?")
            .replace(":requestedLimit", "?")
            .replace(":resetRetryCount", "?")
            .replace(":reason", "?")

    private fun jdbcFailedTaskClaimSql(): String =
        repositoryQuery(TaskRepository::class.java, "findFailedTasksWithLock")
            .replace(":taskType", "?")
            .replace(":limit", "?")

    private fun repositoryQuery(
        type: Class<*>,
        methodName: String,
    ): String =
        requireNotNull(type.methods.singleOrNull { it.name == methodName }?.getAnnotation(Query::class.java)) {
            "Production repository query $methodName is required for this boundary test"
        }.value

    private fun hasColumn(
        connection: Connection,
        tableName: String,
        columnName: String,
    ): Boolean =
        connection
            .prepareStatement(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = ? AND column_name = ?
                )
                """.trimIndent(),
            ).use { statement ->
                statement.setString(1, tableName)
                statement.setString(2, columnName)
                statement.executeQuery().use { result ->
                    result.next()
                    result.getBoolean(1)
                }
            }

    private data class AdmissionResult(
        val sharedInsertCount: Int,
        val markerInsertCount: Int,
    )
}
