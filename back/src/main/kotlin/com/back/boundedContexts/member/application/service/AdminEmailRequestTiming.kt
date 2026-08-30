package com.back.boundedContexts.member.application.service

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

@Component
class AdminEmailRequestTiming(
    @param:Value("\${custom.auth.adminEmail.requestDeadlineMillis:10000}")
    private val requestDeadlineMillis: Long = 10_000,
) {
    init {
        require(requestDeadlineMillis in 1_000..10_000) {
            "custom.auth.adminEmail.requestDeadlineMillis must be between 1000 and 10000."
        }
    }

    fun startedAtNanos(): Long = System.nanoTime()

    fun awaitMinimum(startedAtNanos: Long) {
        val deadlineNanos = startedAtNanos + TimeUnit.MILLISECONDS.toNanos(requestDeadlineMillis)
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
