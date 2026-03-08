package com.back.global.security.config

import com.back.boundedContexts.member.app.shared.ActorFacade
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.global.app.AppConfig
import com.back.global.exception.app.AppException
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import jakarta.servlet.FilterChain
import jakarta.servlet.http.Cookie
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.Authentication
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import tools.jackson.databind.ObjectMapper

@Component
class CustomAuthenticationFilter(
    private val actorFacade: ActorFacade,
    private val objectMapper: ObjectMapper,
) : OncePerRequestFilter() {
    private val publicApiPaths = setOf(
        "/member/api/v1/members/auth/login",
        "/member/api/v1/members/auth/logout",
        "/member/api/v1/members",
        "/member/api/v1/members/randomSecureTip",
    )

    private val publicApiPatterns = listOf(
        Regex("/member/api/v1/members/\\d+/redirectToProfileImg")
    )

    private val filteredPrefixes = listOf("/member/api/")

    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        val uri = request.requestURI
        if (filteredPrefixes.none { uri.startsWith(it) }) return true
        if (uri in publicApiPaths) return true
        if (publicApiPatterns.any { it.matches(uri) }) return true
        return false
    }

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        try {
            authenticateIfPossible(request, response)
            filterChain.doFilter(request, response)
        } catch (e: AppException) {
            val rsData: RsData<Void> = e.rsData

            response.contentType = "$APPLICATION_JSON_VALUE; charset=UTF-8"
            response.status = rsData.statusCode
            response.writer.write(objectMapper.writeValueAsString(rsData))
        }
    }

    private fun authenticateIfPossible(request: HttpServletRequest, response: HttpServletResponse) {
        val (apiKey, accessToken) = extractTokens(request)

        if (apiKey.isBlank() && accessToken.isBlank()) return

        if (apiKey == AppConfig.systemMemberApiKey && accessToken.isBlank()) {
            authenticate(MemberPolicy.SYSTEM)
            return
        }

        val payloadMember = accessToken
            .takeIf { it.isNotBlank() }
            ?.let(actorFacade::payload)
            ?.let { Member(it.id, it.username, null, it.name) }

        if (payloadMember != null) {
            authenticate(payloadMember)
            return
        }

        val member = actorFacade.findByApiKey(apiKey)
            ?: throw AppException("401-3", "API 키가 유효하지 않습니다.")

        val newAccessToken = actorFacade.genAccessToken(member)
        response.addCookie(Cookie("accessToken", newAccessToken).apply {
            path = "/"
            isHttpOnly = true
        })
        response.addHeader(HttpHeaders.AUTHORIZATION, newAccessToken)

        authenticate(member)
    }

    private fun extractTokens(request: HttpServletRequest): Pair<String, String> {
        val headerAuthorization = request.getHeader(HttpHeaders.AUTHORIZATION).orEmpty()

        return if (headerAuthorization.isNotBlank()) {
            if (!headerAuthorization.startsWith("Bearer ")) {
                throw AppException("401-2", "${HttpHeaders.AUTHORIZATION} 헤더가 Bearer 형식이 아닙니다.")
            }

            val bits = headerAuthorization.split(" ", limit = 3)
            bits.getOrNull(1).orEmpty() to bits.getOrNull(2).orEmpty()
        } else {
            request.cookies
                ?.firstOrNull { it.name == "apiKey" }
                ?.value
                .orEmpty() to request.cookies
                ?.firstOrNull { it.name == "accessToken" }
                ?.value
                .orEmpty()
        }
    }

    private fun authenticate(member: Member) {
        val user: UserDetails = SecurityUser(
            member.id,
            member.username,
            "",
            member.name,
            member.authorities,
        )

        val authentication: Authentication =
            UsernamePasswordAuthenticationToken(user, user.password, user.authorities)

        SecurityContextHolder.getContext().authentication = authentication
    }
}
