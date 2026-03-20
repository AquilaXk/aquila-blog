package com.back.global.web.application

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.app.application.AppFacade
import com.back.global.exception.application.AppException
import com.back.global.security.domain.SecurityUser
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseCookie
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import java.time.Duration

/**
 * Rq는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
@Component
class Rq(
    private val req: HttpServletRequest,
    private val resp: HttpServletResponse,
    private val actorApplicationService: ActorApplicationService,
) {
    private val logger = LoggerFactory.getLogger(Rq::class.java)

    val actorOrNull: Member?
        get() =
            (SecurityContextHolder.getContext()?.authentication?.principal as? SecurityUser)
                ?.let { securityUser ->
                    runCatching { actorApplicationService.memberOf(securityUser) }
                        .onFailure { exception ->
                            logger.warn(
                                "actor_resolution_fallback actorId={} reason={}",
                                securityUser.id,
                                exception::class.java.simpleName,
                                exception,
                            )
                        }.getOrNull()
                }

    val actor: Member
        get() = actorOrNull ?: throw AppException("401-1", "로그인 후 이용해주세요.")

    val clientIp: String
        get() = req.remoteAddr.orEmpty()

    val userAgent: String
        get() = req.getHeader("User-Agent").orEmpty()

    fun getHeader(
        name: String,
        defaultValue: String,
    ): String = req.getHeader(name) ?: defaultValue

    fun setHeader(
        name: String,
        value: String,
    ) {
        resp.setHeader(name, value)
    }

    fun getCookieValue(
        name: String,
        defaultValue: String,
    ): String =
        req.cookies
            ?.asSequence()
            ?.filter { it.name == name }
            ?.mapNotNull { it.value.takeIf(String::isNotBlank) }
            ?.lastOrNull()
            ?: defaultValue

    /**
     * 쿠키 속성을 정책에 맞게 설정하고 보안 플래그를 강제합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    fun setCookie(
        name: String,
        value: String?,
        maxAgeSeconds: Int = 60 * 60 * 24 * 365,
    ) {
        val cookieDomain = AppFacade.siteCookieDomain.trim()
        val maxAge = if (value.isNullOrBlank()) 0 else maxAgeSeconds.coerceAtLeast(1)

        val builder =
            ResponseCookie
                .from(name, value ?: "")
                .path("/")
                .httpOnly(true)
                .secure(true)
                .sameSite("Strict")
                .maxAge(Duration.ofSeconds(maxAge.toLong()))

        if (cookieDomain.isNotBlank()) {
            builder.domain(cookieDomain)
        }

        resp.addHeader(HttpHeaders.SET_COOKIE, builder.build().toString())
    }

    fun deleteCookie(name: String) {
        setCookie(name, null, 0)
    }
}
