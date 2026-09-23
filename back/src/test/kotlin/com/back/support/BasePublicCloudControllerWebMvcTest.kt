package com.back.support

import com.back.boundedContexts.cloud.adapter.web.ApiV1PublicCloudController
import com.back.boundedContexts.cloud.application.service.CloudExternalPlaybackTokenService
import com.back.global.observability.ErrorMetrics
import com.back.global.security.config.ApiRateLimitBackstopFilter
import com.back.global.security.config.ApiRuntimeBoundaryFilter
import com.back.global.security.config.CustomAuthenticationFilter
import com.back.global.web.application.ClientIpResolver
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
import org.springframework.security.web.SecurityFilterChain
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc

@WebMvcTest(
    ApiV1PublicCloudController::class,
    excludeFilters = [
        ComponentScan.Filter(
            type = FilterType.ASSIGNABLE_TYPE,
            classes = [
                CustomAuthenticationFilter::class,
                ApiRateLimitBackstopFilter::class,
                ApiRuntimeBoundaryFilter::class,
            ],
        ),
    ],
)
@Import(BasePublicCloudControllerWebMvcTest.TestSecurityConfig::class, ClientIpResolver::class)
abstract class BasePublicCloudControllerWebMvcTest : BaseIntegrationTest() {
    @Autowired
    protected lateinit var mvc: MockMvc

    @MockitoBean
    protected lateinit var cloudExternalPlaybackTokenService: CloudExternalPlaybackTokenService

    @MockitoBean(name = "jpaMappingContext")
    protected lateinit var jpaMappingContext: JpaMetamodelMappingContext

    @MockitoBean
    protected lateinit var errorMetrics: ErrorMetrics

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
                    authorize(anyRequest, permitAll)
                }
            }
            return http.build()
        }
    }
}
