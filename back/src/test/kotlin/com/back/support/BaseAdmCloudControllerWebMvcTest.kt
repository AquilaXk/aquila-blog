package com.back.support

import com.back.boundedContexts.cloud.adapter.web.ApiV1AdmCloudController
import com.back.boundedContexts.cloud.application.service.CloudFileService
import com.back.global.security.config.CustomAuthenticationFilter
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.ComponentScan
import org.springframework.context.annotation.FilterType
import org.springframework.context.annotation.Import
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc

@WebMvcTest(
    ApiV1AdmCloudController::class,
    excludeFilters = [
        ComponentScan.Filter(
            type = FilterType.ASSIGNABLE_TYPE,
            classes = [CustomAuthenticationFilter::class],
        ),
    ],
)
@Import(BaseAdmCloudControllerWebMvcTest.TestSecurityConfig::class)
abstract class BaseAdmCloudControllerWebMvcTest : BaseIntegrationTest() {
    @Autowired
    protected lateinit var mvc: MockMvc

    @MockitoBean
    protected lateinit var cloudFileService: CloudFileService

    @MockitoBean(name = "jpaMappingContext")
    protected lateinit var jpaMappingContext: JpaMetamodelMappingContext

    @TestConfiguration
    class TestSecurityConfig {
        @Bean
        fun testSecurityFilterChain(http: HttpSecurity): SecurityFilterChain {
            http {
                csrf { disable() }
                formLogin { disable() }
                logout { disable() }
                httpBasic { disable() }
                sessionManagement {
                    sessionCreationPolicy = SessionCreationPolicy.STATELESS
                }
                authorizeHttpRequests {
                    authorize("/system/api/v1/adm/cloud/**", hasRole("ADMIN"))
                    authorize(anyRequest, permitAll)
                }
                exceptionHandling {
                    authenticationEntryPoint = jsonAuthenticationEntryPoint()
                    accessDeniedHandler = jsonAccessDeniedHandler()
                }
            }

            return http.build()
        }

        @Bean
        fun jsonAuthenticationEntryPoint(): AuthenticationEntryPoint =
            AuthenticationEntryPoint { _, response, _ ->
                response.status = 401
                response.contentType = "$APPLICATION_JSON_VALUE;charset=UTF-8"
                response.writer.write("""{"resultCode":"401-1","msg":"로그인 후 이용해주세요."}""")
            }

        @Bean
        fun jsonAccessDeniedHandler(): AccessDeniedHandler =
            AccessDeniedHandler { _, response, _ ->
                response.status = 403
                response.contentType = "$APPLICATION_JSON_VALUE;charset=UTF-8"
                response.writer.write("""{"resultCode":"403-1","msg":"권한이 없습니다."}""")
            }
    }
}
