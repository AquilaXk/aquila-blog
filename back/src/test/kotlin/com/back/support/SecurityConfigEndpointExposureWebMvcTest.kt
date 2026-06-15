package com.back.support

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.config.MemberSecurityConfigurer
import com.back.boundedContexts.member.config.shared.AuthSecurityConfigurer
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.post.config.PostSecurityConfigurer
import com.back.global.security.application.AuthIpSecurityService
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.security.config.ApiCorsPolicy
import com.back.global.security.config.CustomAuthenticationFilter
import com.back.global.security.config.PublicApiRequestMatcher
import com.back.global.security.config.PublicApiRouteContributor
import com.back.global.security.config.SecurityConfig
import com.back.global.security.config.oauth2.CustomOAuth2AuthorizationRequestResolver
import com.back.global.security.config.oauth2.CustomOAuth2LoginSuccessHandler
import com.back.global.security.config.oauth2.CustomOAuth2UserService
import com.back.global.security.config.oauth2.CustomOidcUserService
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.ClientIpResolver
import com.back.global.web.application.Rq
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestComponent
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.core.env.Environment
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.ObjectMapper

@WebMvcTest(controllers = [SecurityConfigEndpointExposureWebMvcTestSupport.ProbeController::class])
@Import(
    SecurityConfig::class,
    SecurityConfigEndpointExposureWebMvcTestSupport.TestBeans::class,
)
@TestPropertySource(
    properties = [
        "custom.security.apiRateLimit.enabled=false",
        "spring.security.oauth2.client.registration.kakao.client-id=test-kakao-client-id",
    ],
)
abstract class SecurityConfigEndpointExposureWebMvcTestSupport {
    @Autowired
    protected lateinit var mvc: MockMvc

    @MockitoBean
    protected lateinit var customOAuth2LoginSuccessHandler: CustomOAuth2LoginSuccessHandler

    @MockitoBean
    protected lateinit var customOAuth2AuthorizationRequestResolver: CustomOAuth2AuthorizationRequestResolver

    @MockitoBean
    protected lateinit var customOAuth2UserService: CustomOAuth2UserService

    @MockitoBean
    protected lateinit var customOidcUserService: CustomOidcUserService

    @MockitoBean(name = "jpaMappingContext")
    protected lateinit var jpaMappingContext: JpaMetamodelMappingContext

    @RestController
    @TestComponent
    class ProbeController {
        @GetMapping("/__security-config-test-probe")
        fun probe(): String = "ok"
    }

    @TestConfiguration
    class TestBeans {
        @Bean
        fun authSecurityConfigurer(): AuthSecurityConfigurer = AuthSecurityConfigurer()

        @Bean
        fun memberSecurityConfigurer(): MemberSecurityConfigurer = MemberSecurityConfigurer(legacyDirectJoinEnabled = false)

        @Bean
        fun postSecurityConfigurer(): PostSecurityConfigurer = PostSecurityConfigurer()

        @Bean
        fun apiCorsPolicy(environment: Environment): ApiCorsPolicy =
            ApiCorsPolicy(
                environment = environment,
                siteFrontUrl = "https://www.aquilaxk.site",
                siteBackUrl = "https://api.aquilaxk.site",
                siteCookieDomain = "aquilaxk.site",
            )

        @Bean
        fun customAuthenticationFilter(
            apiCorsPolicy: ApiCorsPolicy,
            environment: Environment,
            objectMapper: ObjectMapper,
        ): CustomAuthenticationFilter =
            CustomAuthenticationFilter(
                actorApplicationService = mock(ActorApplicationService::class.java),
                memberSessionUseCase = mock(MemberSessionUseCase::class.java),
                authIpSecurityService = mock(AuthIpSecurityService::class.java),
                authSecurityEventService = mock(AuthSecurityEventService::class.java),
                authCookieService = mock(AuthCookieService::class.java),
                clientIpResolver = mock(ClientIpResolver::class.java),
                objectMapper = objectMapper,
                publicApiRequestMatcher = PublicApiRequestMatcher(emptyList<PublicApiRouteContributor>()),
                apiCorsPolicy = apiCorsPolicy,
                environment = environment,
                rq = mock(Rq::class.java),
                freshLookupGraceSeconds = 15,
            )
    }
}

@ActiveProfiles("prod")
@DisplayName("SecurityConfig prod endpoint exposure 테스트")
class SecurityConfigProdEndpointExposureWebMvcTest : SecurityConfigEndpointExposureWebMvcTestSupport() {
    @Test
    @DisplayName("prod에서 public Swagger와 OpenAPI는 익명 접근을 401로 막는다")
    fun `prod protects public api docs from anonymous access`() {
        listOf(
            "/swagger-ui/index.html",
            "/v3/api-docs",
        ).forEach { path ->
            mvc.get(path).andExpect {
                status { isUnauthorized() }
            }
        }
    }

    @Test
    @DisplayName("prod에서 public Prometheus forwarded 요청은 익명 접근을 401로 막는다")
    fun `prod protects public prometheus forwarded access from anonymous access`() {
        val result =
            mvc.get("/actuator/prometheus") {
                header("X-Forwarded-For", "203.0.113.10")
            }
        result.andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    @DisplayName("prod에서 내부 Prometheus direct scrape는 익명 보안 체인을 통과해 no-handler까지 도달한다")
    fun `prod keeps internal prometheus direct scrape public`() {
        mvc.get("/actuator/prometheus").andExpect {
            status { isInternalServerError() }
        }
    }

    @Test
    @DisplayName("prod에서 public Swagger와 OpenAPI는 일반 사용자 접근을 403으로 막는다")
    @WithMockUser(roles = ["USER"])
    fun `prod protects public api docs from non admin access`() {
        listOf(
            "/swagger-ui/index.html",
            "/v3/api-docs",
        ).forEach { path ->
            mvc.get(path).andExpect {
                status { isForbidden() }
            }
        }
    }

    @Test
    @DisplayName("prod에서 관리자는 Swagger와 OpenAPI 보안 체인을 통과해 no-handler까지 도달한다")
    @WithMockUser(roles = ["ADMIN"])
    fun `prod lets admin pass api docs security checks to application handler layer`() {
        listOf(
            "/swagger-ui/index.html",
            "/v3/api-docs",
        ).forEach { path ->
            mvc.get(path).andExpect {
                status { isInternalServerError() }
            }
        }
    }

    @Test
    @DisplayName("prod에서 일반 사용자는 첨부 파일 업로드 보안 체인을 통과하지 못한다")
    @WithMockUser(roles = ["USER"])
    fun `prod protects post file upload from non admin access`() {
        mvc.post("/post/api/v1/posts/files").andExpect {
            status { isForbidden() }
        }
    }

    @Test
    @DisplayName("prod에서 관리자는 첨부 파일 업로드 보안 체인을 통과해 handler 계층까지 도달한다")
    @WithMockUser(roles = ["ADMIN"])
    fun `prod lets admin pass post file upload security checks to application handler layer`() {
        mvc.post("/post/api/v1/posts/files").andExpect {
            status { isInternalServerError() }
        }
    }

    @Test
    @DisplayName("prod에서 liveness probe는 익명 보안 체인을 통과해 no-handler까지 도달한다")
    fun `prod keeps liveness probe public`() {
        mvc.get("/actuator/health/liveness").andExpect {
            status { isInternalServerError() }
        }
    }
}

@ActiveProfiles("test")
@DisplayName("SecurityConfig non-prod endpoint exposure 테스트")
class SecurityConfigNonProdEndpointExposureWebMvcTest : SecurityConfigEndpointExposureWebMvcTestSupport() {
    @Test
    @DisplayName("non-prod에서는 Prometheus, Swagger, OpenAPI 개발 경로의 익명 접근을 유지한다")
    fun `non prod keeps diagnostics and api docs public`() {
        listOf(
            "/actuator/prometheus",
            "/swagger-ui/index.html",
            "/v3/api-docs",
        ).forEach { path ->
            mvc.get(path).andExpect {
                status { isInternalServerError() }
            }
        }
    }
}
