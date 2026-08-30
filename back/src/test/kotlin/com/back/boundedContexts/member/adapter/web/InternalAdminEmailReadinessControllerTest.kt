package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.port.input.AdminEmailAuthenticationUseCase
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify

class InternalAdminEmailReadinessControllerTest {
    @Test
    fun `readiness delegates to the email authentication use case`() {
        val useCase = mock(AdminEmailAuthenticationUseCase::class.java)

        InternalAdminEmailReadinessController(useCase).verifyReadiness()

        verify(useCase).verifyReadiness()
    }
}
