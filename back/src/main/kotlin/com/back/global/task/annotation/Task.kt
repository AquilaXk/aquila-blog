package com.back.global.task.annotation

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
