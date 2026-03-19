package com.back.global.task.application.port.output

import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import org.springframework.data.domain.Pageable
import java.time.Instant

interface TaskQueueRepositoryPort {
    fun save(task: Task): Task

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
