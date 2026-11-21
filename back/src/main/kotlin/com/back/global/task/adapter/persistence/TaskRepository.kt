package com.back.global.task.adapter.persistence

import com.back.global.task.application.port.output.TaskDlqItemDto
import com.back.global.task.application.port.output.TaskDlqReplayRepositoryPort
import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.application.port.output.TaskRetentionRepositoryPort
import com.back.global.task.application.port.output.TaskTypeCountAggregate
import com.back.global.task.application.port.output.TaskTypeQueueSnapshotAggregate
import com.back.global.task.application.port.output.TaskTypeReadyAggregate
import com.back.global.task.application.port.output.TaskTypeStatusAggregate
import com.back.global.task.model.Task
import com.back.global.task.model.TaskStatus
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.time.Instant

/**
 * TaskRepository는 글로벌 모듈 영속 계층 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 저장소 조회/저장 로직을 도메인 요구사항에 맞게 캡슐화합니다.
 *
 * 참조 구현: felixmosh/bull-board (MIT) — Task DLQ projection & single-pass conditional aggregation
 */
interface TaskRepository :
    JpaRepository<Task, Long>,
    TaskQueueRepositoryPort,
    TaskDlqReplayRepositoryPort,
    TaskRetentionRepositoryPort {
    @Query(
        value = """
            SELECT * FROM task
            WHERE status = 'FAILED'
              AND payload_redacted_at IS NULL
              AND (:taskType IS NULL OR task_type = :taskType)
            ORDER BY modified_at DESC
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
        """,
        nativeQuery = true,
    )
    override fun findFailedTasksWithLock(
        taskType: String?,
        limit: Int,
    ): List<Task>

    @Query(
        value = """
            SELECT * FROM task
            WHERE status = 'FAILED'
              AND payload_redacted_at IS NULL
              AND id IN (:taskIds)
            ORDER BY modified_at DESC
            FOR UPDATE SKIP LOCKED
        """,
        nativeQuery = true,
    )
    override fun findFailedTasksByIdsWithLock(
        @Param("taskIds") taskIds: List<Long>,
    ): List<Task>

    @Query(
        """
        SELECT new com.back.global.task.application.port.output.TaskDlqItemDto(
            t.id,
            t.uid,
            t.taskType,
            t.aggregateType,
            t.aggregateId,
            t.retryCount,
            t.maxRetries,
            t.errorMessage,
            t.createdAt,
            t.modifiedAt
        )
        FROM Task t
        WHERE t.status = com.back.global.task.model.TaskStatus.FAILED
          AND (:taskType IS NULL OR t.taskType = :taskType)
        ORDER BY t.modifiedAt DESC, t.id DESC
        """,
    )
    fun findDlqTasksPaged(
        @Param("taskType") taskType: String?,
        pageable: Pageable,
    ): List<TaskDlqItemDto>

    override fun findDlqTasks(
        taskType: String?,
        limit: Int,
    ): List<TaskDlqItemDto> {
        val safeLimit = limit.coerceIn(1, 100)
        return findDlqTasksPaged(
            taskType = taskType?.trim()?.takeIf(String::isNotBlank),
            pageable = PageRequest.of(0, safeLimit),
        ).map { item ->
            item.copy(errorMessage = item.errorMessage?.take(500))
        }
    }

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

    /**
     * 참조 구현: kagkarlsson/db-scheduler (MIT) — 포화 상태에 도달한 taskType을 SQL 잠금 단계에서 선제 제외
     */
    @Query(
        value = """
            SELECT *
            FROM task
            WHERE status = 'PENDING'
              AND next_retry_at <= NOW()
              AND task_type NOT IN (:excludedTaskTypes)
            ORDER BY next_retry_at ASC
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
        """,
        nativeQuery = true,
    )
    fun findPendingTasksExcludingTypesWithLock(
        @Param("excludedTaskTypes") excludedTaskTypes: Collection<String>,
        @Param("limit") limit: Int,
    ): List<Task>

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

    @Query(
        value = """
            SELECT *
            FROM task
            WHERE status = 'FAILED'
              AND payload_redacted_at IS NULL
              AND payload_purge_after <= :now
              AND execution_lease_token IS NULL
            ORDER BY payload_purge_after ASC
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
        """,
        nativeQuery = true,
    )
    override fun findFailedPayloadsForRedactionWithLock(
        now: Instant,
        limit: Int,
    ): List<Task>

    @Query(
        value = """
            SELECT *
            FROM task
            WHERE status IN ('COMPLETED', 'FAILED', 'QUARANTINED')
              AND row_purge_after <= :now
              AND execution_lease_token IS NULL
            ORDER BY row_purge_after ASC
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
        """,
        nativeQuery = true,
    )
    override fun findTerminalRowsForPurgeWithLock(
        now: Instant,
        limit: Int,
    ): List<Task>

    @Query(
        """
        SELECT new com.back.global.task.application.port.output.TaskTypeQueueSnapshotAggregate(
            t.taskType,
            COALESCE(SUM(CASE WHEN t.status = com.back.global.task.model.TaskStatus.PENDING THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN t.status = com.back.global.task.model.TaskStatus.PENDING AND t.nextRetryAt <= :now THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN t.status = com.back.global.task.model.TaskStatus.PROCESSING THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN t.status = com.back.global.task.model.TaskStatus.COMPLETED THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN t.status = com.back.global.task.model.TaskStatus.FAILED THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN t.status = com.back.global.task.model.TaskStatus.PROCESSING AND t.modifiedAt < :stuckBefore THEN 1L ELSE 0L END), 0L),
            MIN(CASE WHEN t.status = com.back.global.task.model.TaskStatus.PENDING AND t.nextRetryAt <= :now THEN t.nextRetryAt ELSE NULL END),
            MIN(CASE WHEN t.status = com.back.global.task.model.TaskStatus.PROCESSING THEN t.modifiedAt ELSE NULL END)
        )
        FROM Task t
        GROUP BY t.taskType
        """,
    )
    override fun summarizeQueueSnapshotByTaskType(
        @Param("now") now: Instant,
        @Param("stuckBefore") stuckBefore: Instant,
    ): List<TaskTypeQueueSnapshotAggregate>

    @Query(
        """
        SELECT new com.back.global.task.application.port.output.TaskTypeStatusAggregate(
            t.taskType,
            t.status,
            COUNT(t),
            MIN(t.modifiedAt)
        )
        FROM Task t
        GROUP BY t.taskType, t.status
        """,
    )
    override fun summarizeCountsByTaskTypeAndStatus(): List<TaskTypeStatusAggregate>

    @Query(
        """
        SELECT new com.back.global.task.application.port.output.TaskTypeReadyAggregate(
            t.taskType,
            COUNT(t),
            MIN(t.nextRetryAt)
        )
        FROM Task t
        WHERE t.status = :status
          AND t.nextRetryAt <= :now
        GROUP BY t.taskType
        """,
    )
    override fun summarizeReadyPendingByTaskType(
        status: TaskStatus,
        now: Instant,
    ): List<TaskTypeReadyAggregate>

    @Query(
        """
        SELECT new com.back.global.task.application.port.output.TaskTypeCountAggregate(
            t.taskType,
            COUNT(t)
        )
        FROM Task t
        WHERE t.status = :status
          AND t.modifiedAt < :modifiedAt
        GROUP BY t.taskType
        """,
    )
    override fun countStaleProcessingByTaskType(
        status: TaskStatus,
        modifiedAt: Instant,
    ): List<TaskTypeCountAggregate>

    @Query(
        value = """
            SELECT DISTINCT ON (task_type) *
            FROM task
            WHERE status = 'FAILED'
            ORDER BY task_type ASC, modified_at DESC, id DESC
        """,
        nativeQuery = true,
    )
    override fun findLatestFailedTasksByTaskType(): List<Task>

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

    override fun saveAllTasks(tasks: Collection<Task>): List<Task> = saveAll(tasks)
}
