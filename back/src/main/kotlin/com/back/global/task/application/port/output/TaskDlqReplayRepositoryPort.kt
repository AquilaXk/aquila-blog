package com.back.global.task.application.port.output

import com.back.global.task.domain.Task

interface TaskDlqReplayRepositoryPort {
    fun findFailedTasksWithLock(
        taskType: String?,
        limit: Int,
    ): List<Task>
}
