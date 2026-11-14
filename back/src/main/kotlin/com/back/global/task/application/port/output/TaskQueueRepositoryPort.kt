package com.back.global.task.application.port.output

import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import org.springframework.data.domain.Pageable
import java.time.Instant

data class TaskTypeStatusAggregate(
    val taskType: String,
    val status: TaskStatus,
    val count: Long,
    val oldestModifiedAt: Instant?,
)

data class TaskTypeReadyAggregate(
    val taskType: String,
    val count: Long,
    val oldestReadyAt: Instant?,
)

data class TaskTypeCountAggregate(
    val taskType: String,
    val count: Long,
)

interface TaskQueueRepositoryPort {
    fun save(task: Task): Task

    fun saveAllTasks(tasks: Collection<Task>): List<Task>

    fun summarizeCountsByTaskTypeAndStatus(): List<TaskTypeStatusAggregate>

    fun summarizeReadyPendingByTaskType(
        status: TaskStatus,
        now: Instant,
    ): List<TaskTypeReadyAggregate>

    fun countStaleProcessingByTaskType(
        status: TaskStatus,
        modifiedAt: Instant,
    ): List<TaskTypeCountAggregate>

    fun findLatestFailedTasksByTaskType(): List<Task>

    fun countByStatus(status: TaskStatus): Long

    fun countByStatusAndNextRetryAtLessThanEqual(
        status: TaskStatus,
        nextRetryAt: Instant,
    ): Long

    fun countByStatusAndModifiedAtBefore(
        status: TaskStatus,
        modifiedAt: Instant,
    ): Long

    fun countByTaskTypeAndStatus(
        taskType: String,
        status: TaskStatus,
    ): Long

    fun countByTaskTypeAndStatusAndNextRetryAtLessThanEqual(
        taskType: String,
        status: TaskStatus,
        nextRetryAt: Instant,
    ): Long

    fun countByTaskTypeAndStatusAndModifiedAtBefore(
        taskType: String,
        status: TaskStatus,
        modifiedAt: Instant,
    ): Long

    fun findByStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
        status: TaskStatus,
        nextRetryAt: Instant,
        pageable: Pageable,
    ): List<Task>

    fun findByStatusOrderByModifiedAtAsc(
        status: TaskStatus,
        pageable: Pageable,
    ): List<Task>

    fun findByStatusOrderByModifiedAtDesc(
        status: TaskStatus,
        pageable: Pageable,
    ): List<Task>

    fun findByStatusAndModifiedAtBeforeOrderByModifiedAtAsc(
        status: TaskStatus,
        modifiedAt: Instant,
        pageable: Pageable,
    ): List<Task>

    fun findByTaskTypeAndStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
        taskType: String,
        status: TaskStatus,
        nextRetryAt: Instant,
        pageable: Pageable,
    ): List<Task>

    fun findByTaskTypeAndStatusOrderByModifiedAtDesc(
        taskType: String,
        status: TaskStatus,
        pageable: Pageable,
    ): List<Task>
}
