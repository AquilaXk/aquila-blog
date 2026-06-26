package com.back.global.security.config

import com.back.boundedContexts.cloud.config.CloudSecurityConfigurer
import com.back.boundedContexts.member.config.MemberSecurityConfigurer
import com.back.boundedContexts.member.config.shared.AuthSecurityConfigurer
import com.back.boundedContexts.post.config.PostSecurityConfigurer
import com.back.global.rsData.RsData
import com.back.global.security.config.oauth2.CustomOAuth2AuthorizationRequestResolver
import com.back.global.security.config.oauth2.CustomOAuth2LoginFailureHandler
import com.back.global.security.config.oauth2.CustomOAuth2LoginSuccessHandler
import com.back.global.security.config.oauth2.CustomOAuth2UserService
import com.back.global.security.config.oauth2.CustomOidcUserService
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
import org.springframework.security.web.util.matcher.RequestMatcher
import org.springframework.web.cors.UrlBasedCorsConfigurationSource
import tools.jackson.databind.ObjectMapper
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress

@Configuration
class SecurityConfig(
    private val customAuthenticationFilter: CustomAuthenticationFilter,
    private val customOAuth2LoginSuccessHandler: CustomOAuth2LoginSuccessHandler,
    private val customOAuth2LoginFailureHandler: CustomOAuth2LoginFailureHandler,
    private val customOAuth2AuthorizationRequestResolver: CustomOAuth2AuthorizationRequestResolver,
    private val customOAuth2UserService: CustomOAuth2UserService,
    private val customOidcUserService: CustomOidcUserService,
    private val authSecurityConfigurer: AuthSecurityConfigurer,
    private val memberSecurityConfigurer: MemberSecurityConfigurer,
    private val postSecurityConfigurer: PostSecurityConfigurer,
    private val cloudSecurityConfigurer: CloudSecurityConfigurer,
    private val apiCorsPolicy: ApiCorsPolicy,
    private val objectMapper: ObjectMapper,
    private val environment: Environment,
) {
    @Bean
    fun filterChain(
        http: HttpSecurity,
        apiMutationCsrfGuardFilter: ApiMutationCsrfGuardFilter,
    ): SecurityFilterChain {
        val isProd = environment.matchesProfiles("prod")

        http {
            authorizeHttpRequests {
                authorize(HttpMethod.OPTIONS, "/**", permitAll)
                authSecurityConfigurer.configure(this)
                memberSecurityConfigurer.configure(this)
                postSecurityConfigurer.configure(this)
                cloudSecurityConfigurer.configure(this)

                authorize("/*/api/*/adm/**", hasRole("ADMIN"))
                authorize("/*/api/*/**", authenticated)
                authorize("/oauth2/**", permitAll)
                authorize("/login/oauth2/**", permitAll)
                val endpointExposurePolicy = SecurityEndpointExposurePolicy(isProd)
                if (isProd) {
                    // 프로덕션에서는 k8s/lb health probe 외 actuator 공개를 차단한다.
                    authorize("/actuator/health/liveness", permitAll)
                    authorize("/actuator/health/readiness", permitAll)
                    authorize(internalPrometheusScrapeMatcher(), permitAll)
                    authorize("/actuator/**", hasRole("ADMIN"))
                } else {
                    authorize("/actuator/health/**", permitAll)
                    authorize("/actuator/info", permitAll)
                    if (endpointExposurePolicy.allowsPublicPrometheus) {
                        authorize("/actuator/prometheus", permitAll)
                    }
                }
                if (endpointExposurePolicy.allowsPublicOpenApi) {
                    authorize("/swagger-ui/**", permitAll)
                    authorize("/v3/api-docs/**", permitAll)
                } else {
                    authorize("/swagger-ui/**", hasRole("ADMIN"))
                    authorize("/v3/api-docs/**", hasRole("ADMIN"))
                }
                authorize("/error", permitAll)
                authorize(anyRequest, denyAll)
            }

            cors { }

            headers {
                if (isProd) {
                    // Caddy is the single source of response security headers in prod.
                    cacheControl { disable() }
                    contentTypeOptions { disable() }
                    frameOptions { disable() }
                    httpStrictTransportSecurity { disable() }
                }
            }

            csrf { disable() }
            formLogin { disable() }
            logout { disable() }
            httpBasic { disable() }

            sessionManagement {
                sessionCreationPolicy = SessionCreationPolicy.STATELESS
            }

            oauth2Login {
                authenticationSuccessHandler = customOAuth2LoginSuccessHandler
                authenticationFailureHandler = customOAuth2LoginFailureHandler

                authorizationEndpoint {
                    authorizationRequestResolver = customOAuth2AuthorizationRequestResolver
                }

                userInfoEndpoint {
                    userService = customOAuth2UserService
                    oidcUserService = customOidcUserService
                }
            }

            addFilterBefore<UsernamePasswordAuthenticationFilter>(apiMutationCsrfGuardFilter)
            addFilterBefore<UsernamePasswordAuthenticationFilter>(customAuthenticationFilter)

            exceptionHandling {
                authenticationEntryPoint =
                    AuthenticationEntryPoint { request, response, _ ->
                        if (response.isCommitted) {
                            return@AuthenticationEntryPoint
                        }
                        apiCorsPolicy.applyResponseHeadersIfAllowed(request, response)
                        applyNoStoreHeaders(response)
                        response.contentType = "$APPLICATION_JSON_VALUE; charset=UTF-8"
                        response.status = 401
                        response.writer.write(objectMapper.writeValueAsString(RsData<Void>("401-1", "로그인 후 이용해주세요.")))
                    }

                accessDeniedHandler =
                    AccessDeniedHandler { request, response, _ ->
                        if (response.isCommitted) {
                            return@AccessDeniedHandler
                        }
                        apiCorsPolicy.applyResponseHeadersIfAllowed(request, response)
                        applyNoStoreHeaders(response)
                        response.contentType = "$APPLICATION_JSON_VALUE; charset=UTF-8"
                        response.status = 403
                        response.writer.write(objectMapper.writeValueAsString(RsData<Void>("403-1", "권한이 없습니다.")))
                    }
            }
        }

        return http.build()
    }

    @Bean
    fun corsConfigurationSource(): UrlBasedCorsConfigurationSource =
        UrlBasedCorsConfigurationSource().apply {
            registerCorsConfiguration("/**", apiCorsPolicy.corsConfiguration())
        }

    @Bean
    fun apiMutationCsrfGuardFilter(): ApiMutationCsrfGuardFilter =
        ApiMutationCsrfGuardFilter(
            apiCorsPolicy = apiCorsPolicy,
            objectMapper = objectMapper,
        )

    private fun applyNoStoreHeaders(response: HttpServletResponse) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0")
        response.setHeader(HttpHeaders.PRAGMA, "no-cache")
        response.setDateHeader(HttpHeaders.EXPIRES, 0)
    }

    private fun internalPrometheusScrapeMatcher(): RequestMatcher =
        RequestMatcher { request ->
            request.requestURI.removePrefix(request.contextPath.orEmpty()) == "/actuator/prometheus" &&
                request.method.equals("GET", ignoreCase = true) &&
                !hasForwardedClientHeaders(request) &&
                isInternalAddress(request.remoteAddr)
        }

    private fun hasForwardedClientHeaders(request: jakarta.servlet.http.HttpServletRequest): Boolean =
        listOf(
            "Forwarded",
            "X-Forwarded-For",
            "X-Real-IP",
            "CF-Connecting-IP",
            "True-Client-IP",
        ).any { header -> !request.getHeader(header).isNullOrBlank() }

    private fun isInternalAddress(raw: String?): Boolean {
        val address = runCatching { InetAddress.getByName(raw?.trim().orEmpty()) }.getOrNull() ?: return false

        if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isSiteLocalAddress || address.isLinkLocalAddress) {
            return true
        }

        if (address is Inet4Address) {
            val bytes = address.address
            val first = bytes[0].toInt() and 0xFF
            val second = bytes[1].toInt() and 0xFF
            if (first == 100 && second in 64..127) return true
        }

        if (address is Inet6Address) {
            val first = address.address[0].toInt() and 0xFF
            if ((first and 0xFE) == 0xFC) return true
        }

        return false
    }
}

internal data class SecurityEndpointExposurePolicy(
    private val isProd: Boolean,
) {
    val allowsPublicPrometheus: Boolean = !isProd
    val allowsPublicOpenApi: Boolean = !isProd
}
