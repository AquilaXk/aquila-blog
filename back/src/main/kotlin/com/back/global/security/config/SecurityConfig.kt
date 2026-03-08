package com.back.global.security.config

import com.back.boundedContexts.member.config.MemberSecurityConfigurer
import com.back.boundedContexts.member.config.shared.AuthSecurityConfigurer
import com.back.boundedContexts.post.config.PostSecurityConfigurer
import com.back.global.app.AppConfig
import com.back.global.rsData.RsData
import com.back.global.security.config.oauth2.CustomOAuth2AuthorizationRequestResolver
import com.back.global.security.config.oauth2.CustomOAuth2LoginSuccessHandler
import com.back.global.security.config.oauth2.CustomOAuth2UserService
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.UrlBasedCorsConfigurationSource
import tools.jackson.databind.ObjectMapper

@Configuration
class SecurityConfig(
    private val customAuthenticationFilter: CustomAuthenticationFilter,
    private val customOAuth2LoginSuccessHandler: CustomOAuth2LoginSuccessHandler,
    private val customOAuth2AuthorizationRequestResolver: CustomOAuth2AuthorizationRequestResolver,
    private val customOAuth2UserService: CustomOAuth2UserService,
    private val authSecurityConfigurer: AuthSecurityConfigurer,
    private val memberSecurityConfigurer: MemberSecurityConfigurer,
    private val postSecurityConfigurer: PostSecurityConfigurer,
    private val objectMapper: ObjectMapper,
) {
    @Bean
    fun filterChain(http: HttpSecurity): SecurityFilterChain {
        http {
            authorizeHttpRequests {
                authSecurityConfigurer.configure(this)
                memberSecurityConfigurer.configure(this)
                postSecurityConfigurer.configure(this)

                authorize("/*/api/*/adm/**", hasRole("ADMIN"))
                authorize("/*/api/*/**", authenticated)
                authorize(anyRequest, permitAll)
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
                authenticationEntryPoint = AuthenticationEntryPoint { _, response, _ ->
                    response.contentType = "$APPLICATION_JSON_VALUE; charset=UTF-8"
                    response.status = 401
                    response.writer.write(objectMapper.writeValueAsString(RsData<Void>("401-1", "로그인 후 이용해주세요.")))
                }

                accessDeniedHandler = AccessDeniedHandler { _, response, _ ->
                    response.contentType = "$APPLICATION_JSON_VALUE; charset=UTF-8"
                    response.status = 403
                    response.writer.write(objectMapper.writeValueAsString(RsData<Void>("403-1", "권한이 없습니다.")))
                }
            }
        }

        return http.build()
    }

    @Bean
    fun corsConfigurationSource(): UrlBasedCorsConfigurationSource {
        val configuration = CorsConfiguration().apply {
            allowedOrigins = listOf(AppConfig.siteFrontUrl)
            allowedMethods = listOf("GET", "POST", "PUT", "PATCH", "DELETE")
            allowCredentials = true
            allowedHeaders = listOf("*")
        }

        return UrlBasedCorsConfigurationSource().apply {
            registerCorsConfiguration("/*/api/**", configuration)
        }
    }
}
