package com.back.global.task.application

import com.back.global.task.application.port.output.TaskQueueInsertPort
import com.back.global.task.application.port.output.TaskQueueInsertResult
import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import com.back.support.BaseTransactionalIntegrationTest
import jakarta.persistence.EntityManager
import jakarta.persistence.EntityManagerFactory
import org.assertj.core.api.Assertions.assertThat
import org.hibernate.SessionFactory
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.context.TestPropertySource
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

@TestPropertySource(
    properties = [
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.task.scheduling.enabled=false",
        "custom.task.processor.enabled=false",
        "custom.runtime.worker-enabled=false",
    ],
)
class TaskQueueDiagnosticsIntegrationTest : BaseTransactionalIntegrationTest() {
    @Autowired
    private lateinit var taskQueueRepositoryPort: TaskQueueRepositoryPort

    @Autowired
    private lateinit var taskQueueInsertPort: TaskQueueInsertPort

    @Autowired
    private lateinit var taskHandlerRegistry: TaskHandlerRegistry

    @Autowired
    private lateinit var entityManager: EntityManager

    @Autowired
    private lateinit var entityManagerFactory: EntityManagerFactory

    @Test
    fun `diagnoseQueue와 diagnoseTaskType은 실DB에서 6회 이하 집계 쿼리로 정확한 통계를 반환한다`() {
        val entries = taskHandlerRegistry.getRegisteredEntries()
        assertThat(entries.size).isGreaterThanOrEqualTo(2)
        val typeA = entries[0].taskType
        val typeB = entries[1].taskType

        entityManager.createNativeQuery("DELETE FROM task").executeUpdate()
        val now = Instant.now()

        insertSeedTask(typeA, 101L, TaskStatus.PENDING, now.minusSeconds(35), now.minusSeconds(35), null)
        insertSeedTask(typeA, 102L, TaskStatus.PENDING, now.plusSeconds(600), now.minusSeconds(5), null)
        insertSeedTask(typeA, 103L, TaskStatus.PROCESSING, now.minusSeconds(10), now.minusSeconds(1200), null)
        insertSeedTask(typeA, 104L, TaskStatus.PROCESSING, now.minusSeconds(10), now.minusSeconds(10), null)
        insertSeedTask(typeA, 105L, TaskStatus.FAILED, now.minusSeconds(120), now.minusSeconds(120), "older-error-A")
        insertSeedTask(typeA, 106L, TaskStatus.FAILED, now.minusSeconds(5), now.minusSeconds(5), "latest-error-A")

        insertSeedTask(typeB, 201L, TaskStatus.COMPLETED, now.minusSeconds(10), now.minusSeconds(10), null)
        insertSeedTask(typeB, 202L, TaskStatus.FAILED, now.minusSeconds(10), now.minusSeconds(10), "only-error-B")

        entityManager.flush()
        entityManager.clear()

        val statistics = entityManagerFactory.unwrap(SessionFactory::class.java).statistics
        val wasStatisticsEnabled = statistics.isStatisticsEnabled
        statistics.isStatisticsEnabled = true
        try {
            val service =
                TaskQueueDiagnosticsService(
                    taskRepository = taskQueueRepositoryPort,
                    taskHandlerRegistry = taskHandlerRegistry,
                    processingTimeoutSeconds = 900L,
                    diagnosticsCacheSeconds = 0L,
                )

            statistics.clear()
            val queueDiagnostics = service.diagnoseQueue()
            val queueQueryCount = statistics.prepareStatementCount

            assertThat(queueQueryCount).isBetween(1L, 6L)
            assertThat(queueDiagnostics.pendingCount).isEqualTo(2L)
            assertThat(queueDiagnostics.readyPendingCount).isEqualTo(1L)
            assertThat(queueDiagnostics.delayedPendingCount).isEqualTo(1L)
            assertThat(queueDiagnostics.processingCount).isEqualTo(2L)
            assertThat(queueDiagnostics.staleProcessingCount).isEqualTo(1L)
            assertThat(queueDiagnostics.failedCount).isEqualTo(3L)
            assertThat(queueDiagnostics.completedCount).isEqualTo(1L)

            val typeADiag = queueDiagnostics.taskTypes.first { it.taskType == typeA }
            assertThat(typeADiag.pendingCount).isEqualTo(2L)
            assertThat(typeADiag.readyPendingCount).isEqualTo(1L)
            assertThat(typeADiag.delayedPendingCount).isEqualTo(1L)
            assertThat(typeADiag.processingCount).isEqualTo(2L)
            assertThat(typeADiag.staleProcessingCount).isEqualTo(1L)
            assertThat(typeADiag.failedCount).isEqualTo(2L)
            val oldestReadyAgeA = checkNotNull(typeADiag.oldestReadyPendingAgeSeconds)
            assertThat(oldestReadyAgeA).isGreaterThanOrEqualTo(34L)
            assertThat(typeADiag.latestFailureMessage).isEqualTo("latest-error-A")

            val typeBDiag = queueDiagnostics.taskTypes.first { it.taskType == typeB }
            assertThat(typeBDiag.pendingCount).isEqualTo(0L)
            assertThat(typeBDiag.readyPendingCount).isEqualTo(0L)
            assertThat(typeBDiag.failedCount).isEqualTo(1L)
            assertThat(typeBDiag.oldestReadyPendingAgeSeconds).isNull()
            assertThat(typeBDiag.latestFailureMessage).isEqualTo("only-error-B")

            statistics.clear()
            val singleA = service.diagnoseTaskType(typeA)
            val singleQueryCount = statistics.prepareStatementCount

            assertThat(singleQueryCount).isBetween(1L, 7L)
            assertThat(singleA.taskType).isEqualTo(typeADiag.taskType)
            assertThat(singleA.pendingCount).isEqualTo(typeADiag.pendingCount)
            assertThat(singleA.readyPendingCount).isEqualTo(typeADiag.readyPendingCount)
            assertThat(singleA.delayedPendingCount).isEqualTo(typeADiag.delayedPendingCount)
            assertThat(singleA.processingCount).isEqualTo(typeADiag.processingCount)
            assertThat(singleA.staleProcessingCount).isEqualTo(typeADiag.staleProcessingCount)
            assertThat(singleA.failedCount).isEqualTo(typeADiag.failedCount)
            assertThat(singleA.latestFailureMessage).isEqualTo(typeADiag.latestFailureMessage)
            assertThat(singleA.oldestReadyPendingAgeSeconds)
                .isBetween(oldestReadyAgeA, oldestReadyAgeA + 2L)
        } finally {
            statistics.isStatisticsEnabled = wasStatisticsEnabled
        }
    }

    private fun insertSeedTask(
        taskType: String,
        aggregateId: Long,
        status: TaskStatus,
        nextRetryAt: Instant,
        modifiedAt: Instant,
        errorMessage: String?,
    ) {
        val uid = UUID.randomUUID()
        val innerPayload = """{"uid":"$uid","aggregateType":"Post","aggregateId":$aggregateId}"""
        val escapedInner = innerPayload.replace("\"", "\\\"")
        val envelope =
            """{"schemaVersion":2,"taskType":"$taskType","sensitivity":"PUBLIC",""" +
                """"createdAtEpochMs":${modifiedAt.toEpochMilli()},"expiresAtEpochMs":null,"payloadJson":"$escapedInner"}"""

        val result =
            taskQueueInsertPort.insertIfAbsent(
                Task(
                    uid,
                    "Post",
                    aggregateId,
                    taskType,
                    envelope,
                    5,
                    null,
                ),
            )
        assertThat(result).isEqualTo(TaskQueueInsertResult.INSERTED)

        entityManager
            .createNativeQuery(
                """
                UPDATE task
                SET status = :status,
                    next_retry_at = :nextRetryAt,
                    modified_at = :modifiedAt,
                    error_message = :errorMessage
                WHERE uid = :uid
                """.trimIndent(),
            ).setParameter("status", status.name)
            .setParameter("nextRetryAt", Timestamp.from(nextRetryAt))
            .setParameter("modifiedAt", Timestamp.from(modifiedAt))
            .setParameter("errorMessage", errorMessage)
            .setParameter("uid", uid)
            .executeUpdate()
    }
}
