package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.service.AdminEmailAuthenticationService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class InternalAdminEmailReadinessController(
    private val adminEmailAuthenticationService: AdminEmailAuthenticationService,
) {
    @GetMapping("/internal/health/admin-email-auth")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun verifyReadiness() {
        adminEmailAuthenticationService.verifyReadiness()
    }
}
