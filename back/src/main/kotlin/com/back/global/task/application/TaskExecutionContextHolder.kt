package com.back.global.task.application

import java.util.UUID

data class TaskExecutionContext(
    val taskId: Long,
    val taskUid: UUID,
    val taskType: String,
    val executionLeaseToken: UUID,
    val idempotencyKey: String,
)

object TaskExecutionContextHolder {
    private val currentContext = ThreadLocal<TaskExecutionContext>()

    fun current(): TaskExecutionContext? = currentContext.get()

    fun <T> withContext(
        context: TaskExecutionContext,
        block: () -> T,
    ): T {
        val previous = currentContext.get()
        currentContext.set(context)
        return try {
            block()
        } finally {
            if (previous == null) {
                currentContext.remove()
            } else {
                currentContext.set(previous)
            }
        }
    }
}
