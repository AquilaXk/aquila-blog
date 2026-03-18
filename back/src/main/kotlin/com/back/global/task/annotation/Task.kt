package com.back.global.task.annotation

/**
 * Task는 글로벌 동작 확장을 위한 커스텀 애너테이션입니다.
 * 핸들러 바인딩/스캔 시점 메타데이터를 일관되게 제공합니다.
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
annotation class Task(
    val type: String,
    val label: String = "",
    val maxRetries: Int = 10,
    val baseDelaySeconds: Long = 180,
    val backoffMultiplier: Double = 3.0,
    val maxDelaySeconds: Long = 21600,
)
