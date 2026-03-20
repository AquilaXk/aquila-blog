package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import com.back.global.security.domain.toGrantedAuthorities
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.Rq
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

/**
 * CustomAuthenticationFilter는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */
@Component
class CustomAuthenticationFilter(
    private val actorApplicationService: ActorApplicationService,
    private val authCookieService: AuthCookieService,
    private val objectMapper: ObjectMapper,
    private val publicApiRequestMatcher: PublicApiRequestMatcher,
    private val rq: Rq,
) : OncePerRequestFilter() {
    private val log = org.slf4j.LoggerFactory.getLogger(CustomAuthenticationFilter::class.java)
    private val filteredPrefixes = listOf("/member/api/", "/post/api/", "/system/api/", "/ws/", "/sse/")

    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        val uri = request.requestURI
        return filteredPrefixes.none { uri.startsWith(it) }
    }

    /**
     * doFilterInternal 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val isPublicApi = publicApiRequestMatcher.matches(request)

        try {
            try {
                authenticateIfPossible(request, response)
            } catch (e: AppException) {
                if (!isPublicApi) throw e
                // 공개 API는 잘못된 인증정보가 있어도 익명으로 계속 처리한다.
                SecurityContextHolder.clearContext()
            } catch (e: Exception) {
                val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
                log.warn(
                    "authentication_filter_fallback path={} publicApi={} reason={}",
                    path,
                    isPublicApi,
                    e::class.java.simpleName,
                    e,
                )
                if (!isPublicApi) {
                    throw AppException("401-1", "로그인 후 이용해주세요.")
                }
                // 공개 API는 예기치 못한 인증 오류에서도 익명으로 계속 처리한다.
                SecurityContextHolder.clearContext()
            }
            filterChain.doFilter(request, response)
        } catch (e: AppException) {
            if (response.isCommitted) {
                val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
                log.warn(
                    "authentication_app_exception_response_committed path={} code={}",
                    path,
                    e.rsData.resultCode,
                    e,
                )
                return
            }
            val rsData: RsData<Void> = e.rsData

            response.contentType = "$APPLICATION_JSON_VALUE; charset=UTF-8"
            response.status = rsData.statusCode
            response.writer.write(objectMapper.writeValueAsString(rsData))
        }
    }

    /**
     * authenticateIfPossible 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    private fun authenticateIfPossible(
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val (apiKey, accessToken) = extractTokens()

        if (apiKey.isBlank() && accessToken.isBlank()) return

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
        rq.setHeader(HttpHeaders.AUTHORIZATION, "Bearer $newAccessToken")

        authenticate(member)
    }

    /**
     * 입력/환경 데이터를 파싱·정규화해 내부 처리에 안전한 값으로 변환합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    private fun extractTokens(): Pair<String, String> {
        val headerAuthorization = rq.getHeader(HttpHeaders.AUTHORIZATION, "")

        return if (headerAuthorization.isNotBlank()) {
            if (!headerAuthorization.startsWith("Bearer ")) {
                throw AppException("401-2", "${HttpHeaders.AUTHORIZATION} 헤더가 Bearer 형식이 아닙니다.")
            }

            val bits = headerAuthorization.trim().split(Regex("\\s+"))
            when (bits.size) {
                2 -> {
                    if (bits[1].isBlank()) throw AppException("401-2", "${HttpHeaders.AUTHORIZATION} 헤더가 Bearer 형식이 아닙니다.")
                    "" to bits[1]
                }
                3 -> {
                    if (bits[1].isBlank() || bits[2].isBlank()) {
                        throw AppException("401-2", "${HttpHeaders.AUTHORIZATION} 헤더가 Bearer 형식이 아닙니다.")
                    }
                    bits[1] to bits[2]
                }
                else -> throw AppException("401-2", "${HttpHeaders.AUTHORIZATION} 헤더가 Bearer 형식이 아닙니다.")
            }
        } else {
            rq.getCookieValue("apiKey", "") to rq.getCookieValue("accessToken", "")
        }
    }

    /**
     * authenticate 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    private fun authenticate(member: Member) {
        val user: UserDetails =
            SecurityUser(
                member.id,
                member.username,
                "",
                member.name,
                member.toGrantedAuthorities(),
            )

        val authentication: Authentication =
            UsernamePasswordAuthenticationToken(user, user.password, user.authorities)

        SecurityContextHolder.getContext().authentication = authentication
    }

    private fun sanitizeLogValue(
        raw: String?,
        maxLength: Int,
    ): String {
        if (raw.isNullOrBlank()) return "-"

        val sanitized =
            raw
                .replace('\r', ' ')
                .replace('\n', ' ')
                .replace('\t', ' ')
                .replace(LOG_CONTROL_CHAR_REGEX, "?")
                .trim()

        if (sanitized.isBlank()) return "-"
        return sanitized.take(maxLength)
    }

    companion object {
        private const val MAX_PATH_LENGTH = 512
        private val LOG_CONTROL_CHAR_REGEX = Regex("[\\x00-\\x1F\\x7F]")
    }
}
