package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.global.app.AppConfig
import com.back.global.exception.app.AppException
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import com.back.global.web.app.AuthCookieService
import com.back.global.web.app.Rq
import jakarta.servlet.FilterChain
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
    private val actorApplicationService: ActorApplicationService,
    private val authCookieService: AuthCookieService,
    private val objectMapper: ObjectMapper,
    private val publicApiRequestMatcher: PublicApiRequestMatcher,
    private val rq: Rq,
) : OncePerRequestFilter() {
    private val filteredPrefixes = listOf("/member/api/", "/post/api/", "/system/api/", "/ws/", "/sse/")

    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        val uri = request.requestURI
        if (filteredPrefixes.none { uri.startsWith(it) }) return true
        return publicApiRequestMatcher.matches(request)
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

    private fun authenticateIfPossible(
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val (apiKey, accessToken) = extractTokens()

        if (apiKey.isBlank() && accessToken.isBlank()) return

        if (apiKey == AppConfig.systemMemberApiKey && accessToken.isBlank()) {
            // 서버 간 내부 호출은 시스템 멤버 권한으로 바로 인증한다.
            authenticate(MemberPolicy.SYSTEM)
            return
        }

        val payloadMember =
            accessToken
                .takeIf { it.isNotBlank() }
                ?.let(actorApplicationService::payload)
                ?.let { Member(it.id, it.username, null, it.name) }

        if (payloadMember != null) {
            authenticate(payloadMember)
            return
        }

        val member =
            actorApplicationService.findByApiKey(apiKey)
                ?: throw AppException("401-3", "API 키가 유효하지 않습니다.")

        val newAccessToken = actorApplicationService.genAccessToken(member)
        authCookieService.issueAccessToken(newAccessToken)
        rq.setHeader(HttpHeaders.AUTHORIZATION, newAccessToken)

        authenticate(member)
    }

    private fun extractTokens(): Pair<String, String> {
        val headerAuthorization = rq.getHeader(HttpHeaders.AUTHORIZATION, "")

        return if (headerAuthorization.isNotBlank()) {
            // 우리 포맷: "Bearer {apiKey} {accessToken}".
            // accessToken만 사용하는 경우 apiKey 자리에는 빈 문자열이 들어올 수 있다.
            if (!headerAuthorization.startsWith("Bearer ")) {
                throw AppException("401-2", "${HttpHeaders.AUTHORIZATION} 헤더가 Bearer 형식이 아닙니다.")
            }

            val bits = headerAuthorization.split(" ", limit = 3)
            when (bits.size) {
                2 -> "" to bits.getOrNull(1).orEmpty()
                else -> bits.getOrNull(1).orEmpty() to bits.getOrNull(2).orEmpty()
            }
        } else {
            rq.getCookieValue("apiKey", "") to rq.getCookieValue("accessToken", "")
        }
    }

    private fun authenticate(member: Member) {
        val user: UserDetails =
            SecurityUser(
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
