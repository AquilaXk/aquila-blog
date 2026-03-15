package com.back.global.web.application

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.app.application.AppFacade
import com.back.global.exception.application.AppException
import com.back.global.security.domain.SecurityUser
import jakarta.servlet.http.Cookie
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component

@Component
class Rq(
    private val req: HttpServletRequest,
    private val resp: HttpServletResponse,
    private val actorApplicationService: ActorApplicationService,
) {
    val actorOrNull: Member?
        get() =
            (SecurityContextHolder.getContext()?.authentication?.principal as? SecurityUser)
                ?.let { actorApplicationService.memberOf(it) }

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

    fun setCookie(
        name: String,
        value: String?,
        maxAgeSeconds: Int = 60 * 60 * 24 * 365,
    ) {
        val cookieDomain = AppFacade.siteCookieDomain.trim()
        val cookie =
            Cookie(name, value ?: "").apply {
                path = "/"
                isHttpOnly = true
                if (cookieDomain.isNotBlank()) {
                    domain = cookieDomain
                }
                secure = true
                setAttribute("SameSite", "Strict")
                maxAge = if (value.isNullOrBlank()) 0 else maxAgeSeconds.coerceAtLeast(1)
            }

        resp.addCookie(cookie)
    }

    fun deleteCookie(name: String) {
        setCookie(name, null, 0)
    }
}
