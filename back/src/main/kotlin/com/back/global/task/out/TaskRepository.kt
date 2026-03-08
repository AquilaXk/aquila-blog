package com.back.global.task.out

import com.back.global.task.domain.Task
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

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
        nativeQuery = true
    )
    fun findPendingTasksWithLock(limit: Int = 10): List<Task>
}
