package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.port.input.AdminEmailAuthenticationUseCase
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.Mockito.doNothing
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.springframework.http.HttpHeaders
import org.springframework.mock.web.MockHttpServletResponse
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

class InternalAdminEmailReadinessControllerTest {
    @Test
    fun `readiness delegates to the email authentication use case and sets private no-store header`() {
        val useCase = mock(AdminEmailAuthenticationUseCase::class.java)
        val response = MockHttpServletResponse()

        InternalAdminEmailReadinessController(useCase).verifyReadiness(response)

        verify(useCase).verifyReadiness()
        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo("private, no-store, max-age=0")
    }

    @Test
    fun `readiness caches success for 15s and failure for 5s`() {
        val useCase = mock(AdminEmailAuthenticationUseCase::class.java)
        val clock = MutableClock(Instant.parse("2026-11-14T00:00:00Z"))
        val controller = InternalAdminEmailReadinessController(useCase, clock)

        controller.verifyReadiness()
        clock.advanceSeconds(14)
        controller.verifyReadiness()
        verify(useCase, times(1)).verifyReadiness()

        clock.advanceSeconds(1)
        doThrow(IllegalStateException("smtp down")).`when`(useCase).verifyReadiness()
        assertThatThrownBy { controller.verifyReadiness() }.isInstanceOf(IllegalStateException::class.java)

        clock.advanceSeconds(4)
        assertThatThrownBy { controller.verifyReadiness() }.isInstanceOf(IllegalStateException::class.java)
        verify(useCase, times(2)).verifyReadiness()

        clock.advanceSeconds(1)
        doNothing().`when`(useCase).verifyReadiness()
        controller.verifyReadiness()
        verify(useCase, times(3)).verifyReadiness()
    }

    private class MutableClock(
        private var current: Instant,
    ) : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC

        override fun withZone(zone: ZoneId): Clock = this

        override fun instant(): Instant = current

        fun advanceSeconds(seconds: Long) {
            current = current.plusSeconds(seconds)
        }
    }
}
