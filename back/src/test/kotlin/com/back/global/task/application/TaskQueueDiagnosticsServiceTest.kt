package com.back.global.task.application

import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
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

        assertThat(repository.statusCountCalls).isEqualTo(4)
        assertThat(repository.readyPendingCountCalls).isEqualTo(1)
        assertThat(repository.staleProcessingCountCalls).isEqualTo(1)
    }

    private class CountingTaskQueueRepository : TaskQueueRepositoryPort {
        var statusCountCalls = 0
            private set
        var readyPendingCountCalls = 0
            private set
        var staleProcessingCountCalls = 0
            private set

        override fun save(task: Task): Task = error("not used")

        override fun existsByUid(uid: UUID): Boolean = error("not used")

        override fun countByStatus(status: TaskStatus): Long {
            statusCountCalls++
            return 0
        }

        override fun countByStatusAndNextRetryAtLessThanEqual(
            status: TaskStatus,
            nextRetryAt: Instant,
        ): Long {
            readyPendingCountCalls++
            return 0
        }

        override fun countByStatusAndModifiedAtBefore(
            status: TaskStatus,
            modifiedAt: Instant,
        ): Long {
            staleProcessingCountCalls++
            return 0
        }

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
        ): List<Task> = emptyList()

        override fun findByStatusAndModifiedAtBeforeOrderByModifiedAtAsc(
            status: TaskStatus,
            modifiedAt: Instant,
            pageable: Pageable,
        ): List<Task> = emptyList()

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
