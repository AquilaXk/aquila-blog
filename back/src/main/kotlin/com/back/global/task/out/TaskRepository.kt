package com.back.global.task.out

import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import java.time.Instant

interface TaskRepository : JpaRepository<Task, Int> {
    @Query(
        value = """
            SELECT *
            FROM task
            WHERE status = 'PENDING'
            AND next_retry_at <= NOW()
            ORDER BY next_retry_at ASC
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
        """,
        nativeQuery = true,
    )
    fun findPendingTasksWithLock(limit: Int = 10): List<Task>

    @Query(
        value = """
            SELECT *
            FROM task
            WHERE status = 'PROCESSING'
              AND modified_at < :stuckBefore
            ORDER BY modified_at ASC
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
        """,
        nativeQuery = true,
    )
    fun findStaleProcessingTasksWithLock(
        stuckBefore: Instant,
        limit: Int,
    ): List<Task>

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
