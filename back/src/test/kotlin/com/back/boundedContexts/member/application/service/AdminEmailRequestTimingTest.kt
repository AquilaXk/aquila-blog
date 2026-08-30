package com.back.boundedContexts.member.application.service

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class AdminEmailRequestTimingTest {
    @Test
    fun `default timing boundary records a monotonic start`() {
        assertThat(AdminEmailRequestTiming().startedAtNanos()).isPositive()
    }

    @Test
    fun `request deadline outside the edge-safe range is rejected`() {
        assertThatThrownBy { AdminEmailRequestTiming(999) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("custom.auth.adminEmail.requestDeadlineMillis must be between 1000 and 8000.")
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
