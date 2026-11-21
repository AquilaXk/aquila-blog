package com.back.global.task.application.port.output

import com.back.global.task.domain.Task
import java.time.Instant
import java.util.UUID

data class TaskDlqItemDto(
    val id: Long,
    val uid: UUID,
    val taskType: String,
    val aggregateType: String,
    val aggregateId: Long,
    val retryCount: Int,
    val maxRetries: Int,
    val errorMessage: String?,
    val createdAt: Instant,
    val modifiedAt: Instant,
)

/**
 * 참조 구현: felixmosh/bull-board (MIT) — DLQ inspector & batch replay
 */
interface TaskDlqReplayRepositoryPort {
    fun findFailedTasksWithLock(
        taskType: String?,
        limit: Int,
    ): List<Task>

    fun findFailedTasksByIdsWithLock(taskIds: List<Long>): List<Task>

    fun findDlqTasks(
        taskType: String?,
        limit: Int,
    ): List<TaskDlqItemDto>
}
