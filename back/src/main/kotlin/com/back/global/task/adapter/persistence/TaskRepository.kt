package com.back.global.task.adapter.persistence

import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import java.time.Instant

/**
 * TaskRepository는 글로벌 모듈 영속 계층 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 저장소 조회/저장 로직을 도메인 요구사항에 맞게 캡슐화합니다.
 */
interface TaskRepository :
    JpaRepository<Task, Int>,
    TaskQueueRepositoryPort {
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

    override fun countByStatus(status: TaskStatus): Long

    override fun countByStatusAndNextRetryAtLessThanEqual(
        status: TaskStatus,
        nextRetryAt: Instant,
    ): Long

    override fun countByStatusAndModifiedAtBefore(
        status: TaskStatus,
        modifiedAt: Instant,
    ): Long

    override fun countByTaskTypeAndStatus(
        taskType: String,
        status: TaskStatus,
    ): Long

    override fun countByTaskTypeAndStatusAndNextRetryAtLessThanEqual(
        taskType: String,
        status: TaskStatus,
        nextRetryAt: Instant,
    ): Long

    override fun countByTaskTypeAndStatusAndModifiedAtBefore(
        taskType: String,
        status: TaskStatus,
        modifiedAt: Instant,
    ): Long

    override fun findByStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
        status: TaskStatus,
        nextRetryAt: Instant,
        pageable: Pageable,
    ): List<Task>

    override fun findByStatusOrderByModifiedAtAsc(
        status: TaskStatus,
        pageable: Pageable,
    ): List<Task>

    override fun findByStatusOrderByModifiedAtDesc(
        status: TaskStatus,
        pageable: Pageable,
    ): List<Task>

    override fun findByStatusAndModifiedAtBeforeOrderByModifiedAtAsc(
        status: TaskStatus,
        modifiedAt: Instant,
        pageable: Pageable,
    ): List<Task>

    override fun findByTaskTypeAndStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
        taskType: String,
        status: TaskStatus,
        nextRetryAt: Instant,
        pageable: Pageable,
    ): List<Task>

    override fun findByTaskTypeAndStatusOrderByModifiedAtDesc(
        taskType: String,
        status: TaskStatus,
        pageable: Pageable,
    ): List<Task>
}
