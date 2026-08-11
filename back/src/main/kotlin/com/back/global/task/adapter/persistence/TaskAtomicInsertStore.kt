package com.back.global.task.adapter.persistence

import com.back.global.task.application.port.output.TaskQueueInsertPort
import com.back.global.task.application.port.output.TaskQueueInsertResult
import com.back.global.task.domain.Task
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp

internal object TaskAtomicInsertSql {
    private const val INSERT_IF_ABSENT =
        """
        INSERT INTO task (
            uid,
            aggregate_type,
            aggregate_id,
            task_type,
            payload,
            status,
            retry_count,
            max_retries,
            next_retry_at,
            error_message,
            execution_lease_token,
            created_at,
            modified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (uid) DO NOTHING
        """

    @JvmStatic
    fun statement(): String = INSERT_IF_ABSENT
}

@Repository
class TaskAtomicInsertStore(
    private val jdbcTemplate: JdbcTemplate,
) : TaskQueueInsertPort {
    @Transactional
    override fun insertIfAbsent(task: Task): TaskQueueInsertResult {
        val insertedRows =
            jdbcTemplate.update(
                TaskAtomicInsertSql.statement(),
                task.uid,
                task.aggregateType,
                task.aggregateId,
                task.taskType,
                task.payload,
                task.status.name,
                task.retryCount,
                task.maxRetries,
                Timestamp.from(task.nextRetryAt),
                task.errorMessage,
                task.executionLeaseToken,
            )
        check(insertedRows == 0 || insertedRows == 1) {
            "Atomic task insert must affect zero or one row, actual=$insertedRows"
        }
        return if (insertedRows == 1) TaskQueueInsertResult.INSERTED else TaskQueueInsertResult.DUPLICATE
    }
}
