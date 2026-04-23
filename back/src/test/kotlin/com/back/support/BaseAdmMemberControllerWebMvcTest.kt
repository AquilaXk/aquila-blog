package com.back.support

import com.back.boundedContexts.member.adapter.web.ApiV1AdmMemberController
import com.back.boundedContexts.member.application.port.input.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.app.AppConfig
import com.back.global.security.config.CustomAuthenticationFilter
import com.back.global.storage.application.UploadedFileRetentionService
import org.junit.jupiter.api.BeforeAll
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.ComponentScan
import org.springframework.context.annotation.FilterType
import org.springframework.context.annotation.Import
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc

@WebMvcTest(
    ApiV1AdmMemberController::class,
    excludeFilters = [
        ComponentScan.Filter(
            type = FilterType.ASSIGNABLE_TYPE,
            classes = [CustomAuthenticationFilter::class],
        ),
    ],
)
@Import(BaseAdmMemberControllerWebMvcTest.TestSecurityConfig::class)
abstract class BaseAdmMemberControllerWebMvcTest : BaseIntegrationTest() {
    @Autowired
    protected lateinit var mvc: MockMvc

    @MockitoBean
    protected lateinit var memberUseCase: MemberUseCase

    @MockitoBean
    protected lateinit var currentMemberProfileQueryUseCase: CurrentMemberProfileQueryUseCase

    @MockitoBean
    protected lateinit var postImageStoragePort: PostImageStoragePort

    @MockitoBean
    protected lateinit var uploadedFileRetentionService: UploadedFileRetentionService

    @MockitoBean(name = "jpaMappingContext")
    protected lateinit var jpaMappingContext: JpaMetamodelMappingContext

    companion object {
        @JvmStatic
        @BeforeAll
        fun setUpAppConfig() {
            AppConfig(
                siteBackUrl = "http://localhost:8080",
                siteFrontUrl = "http://localhost:3000",
                adminUsername = "admin",
                adminEmail = "admin@test.com",
                adminPassword = "test-password",
            )
        }
    }

    @TestConfiguration
    class TestSecurityConfig {
        @Bean
        fun postImageStorageProperties(): PostImageStorageProperties = PostImageStorageProperties()

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
                    authorize("/member/api/v1/adm/**", hasRole("ADMIN"))
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
                response.contentType = "application/json;charset=UTF-8"
                response.writer.write("""{"resultCode":"401-1","msg":"로그인 후 이용해주세요."}""")
            }

        @Bean
        fun jsonAccessDeniedHandler(): AccessDeniedHandler =
            AccessDeniedHandler { _, response, _ ->
                response.status = 403
                response.contentType = "application/json;charset=UTF-8"
                response.writer.write("""{"resultCode":"403-1","msg":"권한이 없습니다."}""")
            }
    }
}
