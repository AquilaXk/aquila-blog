package com.back.boundedContexts.member.application.service

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

@Component
class AdminEmailRequestTiming(
    @param:Value("\${custom.auth.adminEmail.responseMinimumMillis:1000}")
    private val responseMinimumMillis: Long = 1_000,
) {
    init {
        require(responseMinimumMillis in 1_000..10_000) {
            "custom.auth.adminEmail.responseMinimumMillis must be between 1000 and 10000."
        }
    }

    fun startedAtNanos(): Long = System.nanoTime()

    fun awaitMinimum(startedAtNanos: Long) {
        val deadlineNanos = startedAtNanos + TimeUnit.MILLISECONDS.toNanos(responseMinimumMillis)
        while (true) {
            val remainingNanos = deadlineNanos - System.nanoTime()
            if (remainingNanos <= 0) return
            try {
                TimeUnit.NANOSECONDS.sleep(remainingNanos)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
                return
            }
        }
    }
}
