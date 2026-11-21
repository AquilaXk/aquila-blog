package com.back.global.task.application.port.output

import com.back.global.task.domain.Task

enum class TaskQueueInsertResult {
    INSERTED,
    DUPLICATE,
}

interface TaskQueueInsertPort {
    fun insertIfAbsent(task: Task): TaskQueueInsertResult
}
