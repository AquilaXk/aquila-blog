package com.back.boundedContexts.member.application.service

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.concurrent.TimeUnit

class AdminEmailRequestTimingTest {
    @Test
    fun `default response minimum completes near one second`() {
        val timing = AdminEmailRequestTiming()
        val startedAt = timing.startedAtNanos()

        timing.awaitMinimum(startedAt)

        assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt))
            .isBetween(900, 2_500)
    }

    @Test
    fun `response minimum outside the edge-safe range is rejected`() {
        assertThatThrownBy { AdminEmailRequestTiming(999) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("custom.auth.adminEmail.responseMinimumMillis must be between 1000 and 10000.")
    }

    @Test
    fun `interrupted timing wait preserves interruption and returns`() {
        val timing = AdminEmailRequestTiming(1_000)
        Thread.currentThread().interrupt()
        try {
            timing.awaitMinimum(timing.startedAtNanos())

            assertThat(Thread.currentThread().isInterrupted).isTrue()
        } finally {
            Thread.interrupted()
        }
    }
}
