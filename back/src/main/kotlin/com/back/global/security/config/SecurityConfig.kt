package com.back.global.security.config

import com.back.boundedContexts.member.config.MemberSecurityConfigurer
import com.back.boundedContexts.member.config.shared.AuthSecurityConfigurer
import com.back.boundedContexts.post.config.PostSecurityConfigurer
import com.back.global.app.application.AppFacade
import com.back.global.rsData.RsData
import com.back.global.security.config.oauth2.CustomOAuth2AuthorizationRequestResolver
import com.back.global.security.config.oauth2.CustomOAuth2LoginSuccessHandler
import com.back.global.security.config.oauth2.CustomOAuth2UserService
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
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
import org.springframework.web.cors.UrlBasedCorsConfigurationSource
import tools.jackson.databind.ObjectMapper

/**
 * SecurityConfig는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */

@Configuration
class SecurityConfig(
    private val customAuthenticationFilter: CustomAuthenticationFilter,
    private val customOAuth2LoginSuccessHandler: CustomOAuth2LoginSuccessHandler,
    private val customOAuth2AuthorizationRequestResolver: CustomOAuth2AuthorizationRequestResolver,
    private val customOAuth2UserService: CustomOAuth2UserService,
    private val authSecurityConfigurer: AuthSecurityConfigurer,
    private val memberSecurityConfigurer: MemberSecurityConfigurer,
    private val postSecurityConfigurer: PostSecurityConfigurer,
    private val apiCorsPolicy: ApiCorsPolicy,
    private val objectMapper: ObjectMapper,
) {
    /**
     * 보안/인프라 설정을 요청 처리 체인에 반영합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    @Bean
    fun filterChain(http: HttpSecurity): SecurityFilterChain {
        http {
            authorizeHttpRequests {
                authorize(HttpMethod.OPTIONS, "/**", permitAll)
                authSecurityConfigurer.configure(this)
                memberSecurityConfigurer.configure(this)
                postSecurityConfigurer.configure(this)

                authorize("/*/api/*/adm/**", hasRole("ADMIN"))
                authorize("/*/api/*/**", authenticated)
                authorize("/oauth2/**", permitAll)
                authorize("/login/oauth2/**", permitAll)
                if (AppFacade.isProd) {
                    // 프로덕션에서는 k8s/lb health probe 외 actuator 공개를 차단한다.
                    authorize("/actuator/health/liveness", permitAll)
                    authorize("/actuator/health/readiness", permitAll)
                    authorize("/actuator/prometheus", permitAll)
                    authorize("/actuator/**", hasRole("ADMIN"))
                } else {
                    authorize("/actuator/health/**", permitAll)
                    authorize("/actuator/info", permitAll)
                    authorize("/actuator/prometheus", permitAll)
                }
                authorize("/swagger-ui/**", permitAll)
                authorize("/v3/api-docs/**", permitAll)
                authorize("/error", permitAll)
                authorize(anyRequest, denyAll)
            }

            cors { }

            headers {
                // Public read APIs expose explicit cache policy/etag headers; disable Spring Security default no-store writer.
                cacheControl { disable() }
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

                authorizationEndpoint {
                    authorizationRequestResolver = customOAuth2AuthorizationRequestResolver
                }

                userInfoEndpoint {
                    userService = customOAuth2UserService
                }
            }

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

    /**
     * corsConfigurationSource 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    @Bean
    fun corsConfigurationSource(): UrlBasedCorsConfigurationSource =
        UrlBasedCorsConfigurationSource().apply {
            registerCorsConfiguration("/**", apiCorsPolicy.corsConfiguration())
        }

    private fun applyNoStoreHeaders(response: HttpServletResponse) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0")
        response.setHeader(HttpHeaders.PRAGMA, "no-cache")
        response.setDateHeader(HttpHeaders.EXPIRES, 0)
    }
}
