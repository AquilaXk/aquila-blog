package com.back.global.task.application

import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.application.port.output.TaskTypeCountAggregate
import com.back.global.task.application.port.output.TaskTypeReadyAggregate
import com.back.global.task.application.port.output.TaskTypeStatusAggregate
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import com.back.standard.dto.TaskPayload
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.domain.Pageable
import java.time.Instant
import java.util.UUID

class TaskQueueDiagnosticsServiceTest {
    @Test
    fun `진단 캐시 기본 TTL은 DB count 부하를 줄이기 위해 30초다`() {
        val diagnosticsCacheSecondsParameter =
            TaskQueueDiagnosticsService::class
                .constructors
                .single()
                .parameters
                .single { it.name == "diagnosticsCacheSeconds" }

        val configuredDefault =
            diagnosticsCacheSecondsParameter.annotations
                .filterIsInstance<Value>()
                .single()
                .value

        assertThat(configuredDefault).isEqualTo("\${custom.task.diagnostics.cacheSeconds:30}")
    }

    @Test
    fun `캐시 TTL 안의 연속 진단은 repository count를 재실행하지 않는다`() {
        val repository = CountingTaskQueueRepository()
        val service =
            TaskQueueDiagnosticsService(
                taskRepository = repository,
                taskHandlerRegistry = TaskHandlerRegistry(),
                processingTimeoutSeconds = 900,
                diagnosticsCacheSeconds = 30,
            )

        service.diagnoseQueue()
        service.diagnoseQueue()

        assertThat(repository.groupedStatusCalls).isEqualTo(1)
        assertThat(repository.readyAggregateCalls).isEqualTo(1)
        assertThat(repository.staleAggregateCalls).isEqualTo(1)
        assertThat(repository.sampleQueryCalls).isEqualTo(2)
        assertThat(repository.totalCalls()).isEqualTo(5)
    }

    @Test
    fun `등록된 핸들러가 많아도 diagnoseQueue는 6회 이하 집계 쿼리로 전체 통계를 계산한다`() {
        val t1 = Instant.parse("2026-08-28T00:00:00Z")
        val t2 = Instant.parse("2026-08-28T00:01:00Z")
        val t0 = Instant.parse("2026-08-27T23:55:00Z")
        val failedAlpha =
            Task(
                uid = UUID.randomUUID(),
                aggregateType = "post",
                aggregateId = 10L,
                taskType = "type.alpha",
                payload = "{}",
                status = TaskStatus.FAILED,
                nextRetryAt = t1,
                errorMessage = "boom alpha",
            ).apply {
                modifiedAt = t2
            }
        val staleBeta =
            Task(
                uid = UUID.randomUUID(),
                aggregateType = "post",
                aggregateId = 11L,
                taskType = "type.beta",
                payload = "{}",
                nextRetryAt = t0,
            ).apply {
                modifiedAt = t0
            }

        val repository =
            CountingTaskQueueRepository(
                groupedStatusRows =
                    listOf(
                        TaskTypeStatusAggregate("type.alpha", TaskStatus.PENDING, 3L, t1),
                        TaskTypeStatusAggregate("type.alpha", TaskStatus.PROCESSING, 1L, t2),
                        TaskTypeStatusAggregate("type.alpha", TaskStatus.FAILED, 1L, t2),
                        TaskTypeStatusAggregate("type.beta", TaskStatus.PROCESSING, 2L, t0),
                        TaskTypeStatusAggregate("type.beta", TaskStatus.COMPLETED, 5L, t1),
                        TaskTypeStatusAggregate("type.gamma", TaskStatus.QUARANTINED, 1L, t1),
                    ),
                readyAggregateRows =
                    listOf(
                        TaskTypeReadyAggregate("type.alpha", 2L, t2),
                        TaskTypeReadyAggregate("type.beta", 1L, t1),
                    ),
                staleAggregateRows =
                    listOf(
                        TaskTypeCountAggregate("type.beta", 2L),
                    ),
                latestFailures = listOf(failedAlpha),
                recentFailureSamples = listOf(failedAlpha),
                staleProcessingSamples = listOf(staleBeta),
            )
        val registry = TaskHandlerRegistry()
        val dummyMethod = TaskQueueDiagnosticsServiceTest::class.java.getDeclaredMethod("handleDummyPayload", DummyPayload::class.java)
        listOf("type.alpha", "type.beta", "type.gamma", "type.delta").forEach { taskType ->
            registry.register(
                taskType,
                TaskHandlerEntry.withCurrentDecoder(
                    taskType = taskType,
                    payloadClass = DummyPayload::class.java,
                    handlerMethod = TaskHandlerMethod(this, dummyMethod),
                    retryPolicy = TaskRetryPolicy("label-$taskType", 3, 5, 2.0, 60),
                    schemaVersion = TaskHandlerRegistry.CURRENT_TASK_PAYLOAD_SCHEMA_VERSION,
                    sensitivity = TaskPayloadSensitivity.INTERNAL,
                ),
            )
        }
        val service =
            TaskQueueDiagnosticsService(
                taskRepository = repository,
                taskHandlerRegistry = registry,
                processingTimeoutSeconds = 900,
                diagnosticsCacheSeconds = 30,
            )

        val result = service.diagnoseQueue()
        assertThat(result.taskTypes).hasSize(4)
        assertThat(repository.totalCalls()).isEqualTo(6)
        assertThat(result.pendingCount).isEqualTo(3L)
        assertThat(result.readyPendingCount).isEqualTo(3L)
        assertThat(result.delayedPendingCount).isEqualTo(0L)
        assertThat(result.processingCount).isEqualTo(3L)
        assertThat(result.completedCount).isEqualTo(5L)
        assertThat(result.failedCount).isEqualTo(1L)
        assertThat(result.staleProcessingCount).isEqualTo(2L)
        assertThat(result.oldestReadyPendingAt).isEqualTo(t1)
        assertThat(result.oldestProcessingAt).isEqualTo(t0)
        assertThat(result.recentFailures).hasSize(1)
        assertThat(result.staleProcessingSamples).hasSize(1)

        val alpha = result.taskTypes.first { it.taskType == "type.alpha" }
        assertThat(alpha.pendingCount).isEqualTo(3L)
        assertThat(alpha.readyPendingCount).isEqualTo(2L)
        assertThat(alpha.delayedPendingCount).isEqualTo(1L)
        assertThat(alpha.processingCount).isEqualTo(1L)
        assertThat(alpha.backlogCount).isEqualTo(4L)
        assertThat(alpha.failedCount).isEqualTo(1L)
        assertThat(alpha.latestFailureMessage).isEqualTo("boom alpha")

        val singleAlpha = service.diagnoseTaskType("type.alpha")
        assertThat(singleAlpha.latestFailureMessage).isEqualTo("boom alpha")
    }

    private data class DummyPayload(
        override val uid: UUID = UUID.randomUUID(),
        override val aggregateType: String = "post",
        override val aggregateId: Long = 1L,
    ) : TaskPayload

    @Suppress("unused")
    private fun handleDummyPayload(payload: DummyPayload) {}

    private class CountingTaskQueueRepository(
        private val groupedStatusRows: List<TaskTypeStatusAggregate> = emptyList(),
        private val readyAggregateRows: List<TaskTypeReadyAggregate> = emptyList(),
        private val staleAggregateRows: List<TaskTypeCountAggregate> = emptyList(),
        private val latestFailures: List<Task> = emptyList(),
        private val recentFailureSamples: List<Task> = emptyList(),
        private val staleProcessingSamples: List<Task> = emptyList(),
    ) : TaskQueueRepositoryPort {
        var groupedStatusCalls = 0
            private set
        var readyAggregateCalls = 0
            private set
        var staleAggregateCalls = 0
            private set
        var latestFailuresCalls = 0
            private set
        var sampleQueryCalls = 0
            private set

        fun totalCalls(): Int =
            groupedStatusCalls +
                readyAggregateCalls +
                staleAggregateCalls +
                latestFailuresCalls +
                sampleQueryCalls

        override fun save(task: Task): Task = error("not used")

        override fun saveAllTasks(tasks: Collection<Task>): List<Task> = tasks.map(::save)

        override fun summarizeCountsByTaskTypeAndStatus(): List<TaskTypeStatusAggregate> {
            groupedStatusCalls++
            return groupedStatusRows
        }

        override fun summarizeReadyPendingByTaskType(
            status: TaskStatus,
            now: Instant,
        ): List<TaskTypeReadyAggregate> {
            readyAggregateCalls++
            return readyAggregateRows
        }

        override fun countStaleProcessingByTaskType(
            status: TaskStatus,
            modifiedAt: Instant,
        ): List<TaskTypeCountAggregate> {
            staleAggregateCalls++
            return staleAggregateRows
        }

        override fun findLatestFailedTasksByTaskType(): List<Task> {
            latestFailuresCalls++
            return latestFailures
        }

        override fun countByStatus(status: TaskStatus): Long = error("not used")

        override fun countByStatusAndNextRetryAtLessThanEqual(
            status: TaskStatus,
            nextRetryAt: Instant,
        ): Long = error("not used")

        override fun countByStatusAndModifiedAtBefore(
            status: TaskStatus,
            modifiedAt: Instant,
        ): Long = error("not used")

        override fun countByTaskTypeAndStatus(
            taskType: String,
            status: TaskStatus,
        ): Long = error("not used")

        override fun countByTaskTypeAndStatusAndNextRetryAtLessThanEqual(
            taskType: String,
            status: TaskStatus,
            nextRetryAt: Instant,
        ): Long = error("not used")

        override fun countByTaskTypeAndStatusAndModifiedAtBefore(
            taskType: String,
            status: TaskStatus,
            modifiedAt: Instant,
        ): Long = error("not used")

        override fun findByStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
            status: TaskStatus,
            nextRetryAt: Instant,
            pageable: Pageable,
        ): List<Task> = emptyList()

        override fun findByStatusOrderByModifiedAtAsc(
            status: TaskStatus,
            pageable: Pageable,
        ): List<Task> = emptyList()

        override fun findByStatusOrderByModifiedAtDesc(
            status: TaskStatus,
            pageable: Pageable,
        ): List<Task> {
            sampleQueryCalls++
            return recentFailureSamples
        }

        override fun findByStatusAndModifiedAtBeforeOrderByModifiedAtAsc(
            status: TaskStatus,
            modifiedAt: Instant,
            pageable: Pageable,
        ): List<Task> {
            sampleQueryCalls++
            return staleProcessingSamples
        }

        override fun findByTaskTypeAndStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
            taskType: String,
            status: TaskStatus,
            nextRetryAt: Instant,
            pageable: Pageable,
        ): List<Task> = error("not used")

        override fun findByTaskTypeAndStatusOrderByModifiedAtDesc(
            taskType: String,
            status: TaskStatus,
            pageable: Pageable,
        ): List<Task> = error("not used")
    }
}
