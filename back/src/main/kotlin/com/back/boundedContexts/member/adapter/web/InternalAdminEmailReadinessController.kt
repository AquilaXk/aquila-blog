package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.port.input.AdminEmailAuthenticationUseCase
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.Clock
import java.time.Duration
import java.time.Instant

@RestController
class InternalAdminEmailReadinessController(
    private val adminEmailAuthenticationUseCase: AdminEmailAuthenticationUseCase,
    private val clock: Clock,
) {
    @Autowired
    constructor(
        adminEmailAuthenticationUseCase: AdminEmailAuthenticationUseCase,
    ) : this(adminEmailAuthenticationUseCase, Clock.systemUTC())

    private val lock = Any()

    @Volatile
    private var lastVerifiedAt: Instant? = null

    @Volatile
    private var lastFailure: CachedFailure? = null

    @GetMapping("/internal/health/admin-email-auth")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun verifyReadiness(response: HttpServletResponse? = null) {
        response?.setHeader(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0")
        val now = clock.instant()
        if (isFreshSuccess(now)) return
        lastFailure?.takeIf { now.isBefore(it.expiresAt) }?.let { throw it.error }

        synchronized(lock) {
            val lockedNow = clock.instant()
            if (isFreshSuccess(lockedNow)) return
            lastFailure?.takeIf { lockedNow.isBefore(it.expiresAt) }?.let { throw it.error }
            try {
                adminEmailAuthenticationUseCase.verifyReadiness()
                lastVerifiedAt = lockedNow
                lastFailure = null
            } catch (failure: RuntimeException) {
                lastVerifiedAt = null
                lastFailure = CachedFailure(failure, lockedNow.plus(FAILURE_CACHE_TTL))
                throw failure
            }
        }
    }

    private fun isFreshSuccess(now: Instant): Boolean {
        val verifiedAt = lastVerifiedAt ?: return false
        return now.isBefore(verifiedAt.plus(SUCCESS_CACHE_TTL))
    }

    private data class CachedFailure(
        val error: RuntimeException,
        val expiresAt: Instant,
    )

    companion object {
        private val SUCCESS_CACHE_TTL: Duration = Duration.ofSeconds(15)
        private val FAILURE_CACHE_TTL: Duration = Duration.ofSeconds(5)
    }
}
