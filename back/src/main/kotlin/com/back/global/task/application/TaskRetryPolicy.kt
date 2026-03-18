package com.back.global.task.application

import kotlin.math.pow
import kotlin.math.roundToLong

/**
 * TaskRetryPolicy는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
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

    /**
     * 재시도 횟수에 따라 다음 지연 시간을 계산합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
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
