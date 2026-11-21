package com.back.global.task.application.port.output

import com.back.global.task.domain.Task
import java.time.Instant

interface TaskRetentionRepositoryPort {
    fun findFailedPayloadsForRedactionWithLock(
        now: Instant,
        limit: Int,
    ): List<Task>

    fun findTerminalRowsForPurgeWithLock(
        now: Instant,
        limit: Int,
    ): List<Task>

    fun deleteAllInBatch(entities: Iterable<Task>)
}
