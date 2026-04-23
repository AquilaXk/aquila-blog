package com.back.support

import com.back.boundedContexts.member.adapter.web.ApiV1MemberController
import com.back.boundedContexts.member.application.port.input.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.global.app.AppConfig
import com.back.global.security.application.SecurityTipProvider
import com.back.global.security.config.CustomAuthenticationFilter
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
import org.springframework.security.web.SecurityFilterChain
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.web.servlet.mvc.annotation.ResponseStatusExceptionResolver

@WebMvcTest(
    ApiV1MemberController::class,
    excludeFilters = [
        ComponentScan.Filter(
            type = FilterType.ASSIGNABLE_TYPE,
            classes = [CustomAuthenticationFilter::class],
        ),
    ],
)
@Import(BaseMemberControllerWebMvcTest.TestSecurityConfig::class)
abstract class BaseMemberControllerWebMvcTest : BaseIntegrationTest() {
    @Autowired
    protected lateinit var mvc: MockMvc

    @MockitoBean
    protected lateinit var memberUseCase: MemberUseCase

    @MockitoBean
    protected lateinit var currentMemberProfileQueryUseCase: CurrentMemberProfileQueryUseCase

    @MockitoBean
    protected lateinit var securityTipProvider: SecurityTipProvider

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
        fun testSecurityFilterChain(http: HttpSecurity): SecurityFilterChain {
            http {
                csrf { disable() }
                formLogin { disable() }
                logout { disable() }
                httpBasic { disable() }
                authorizeHttpRequests {
                    authorize(anyRequest, permitAll)
                }
            }

            return http.build()
        }

        @Bean
        fun appExceptionStatusCodeResolver(): ResponseStatusExceptionResolver = ResponseStatusExceptionResolver()
    }
}
