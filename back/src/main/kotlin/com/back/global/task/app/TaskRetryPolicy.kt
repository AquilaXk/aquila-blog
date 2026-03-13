package com.back.global.task.app

import kotlin.math.pow
import kotlin.math.roundToLong

data class TaskRetryPolicy(
    val label: String,
    val maxRetries: Int,
    val baseDelaySeconds: Long,
    val backoffMultiplier: Double,
    val maxDelaySeconds: Long,
) {
    init {
        require(label.isNotBlank()) { "TaskRetryPolicy.label must not be blank" }
        require(maxRetries >= 1) { "TaskRetryPolicy.maxRetries must be at least 1" }
        require(baseDelaySeconds >= 1) { "TaskRetryPolicy.baseDelaySeconds must be at least 1" }
        require(backoffMultiplier >= 1.0) { "TaskRetryPolicy.backoffMultiplier must be at least 1.0" }
        require(maxDelaySeconds >= baseDelaySeconds) {
            "TaskRetryPolicy.maxDelaySeconds must be greater than or equal to baseDelaySeconds"
        }
    }

    fun nextDelaySeconds(retryCount: Int): Long {
        if (retryCount <= 0) return baseDelaySeconds

        val exponentialDelay =
            baseDelaySeconds.toDouble() * backoffMultiplier.pow((retryCount - 1).toDouble())

        return exponentialDelay
            .roundToLong()
            .coerceAtLeast(baseDelaySeconds)
            .coerceAtMost(maxDelaySeconds)
    }

    companion object {
        fun fallback(taskType: String): TaskRetryPolicy =
            TaskRetryPolicy(
                label = taskType,
                maxRetries = 10,
                baseDelaySeconds = 180,
                backoffMultiplier = 3.0,
                maxDelaySeconds = 21600,
            )
    }
}
