package com.back.support

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.config.MemberSecurityConfigurer
import com.back.boundedContexts.member.config.shared.AuthSecurityConfigurer
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.post.config.PostSecurityConfigurer
import com.back.global.security.application.AuthIpSecurityService
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.security.config.AccessTokenAuthenticationHandler
import com.back.global.security.config.ApiCorsPolicy
import com.back.global.security.config.ApiKeyAuthorityRefreshHandler
import com.back.global.security.config.AuthIpSecurityVerifier
import com.back.global.security.config.AuthTokenExtractor
import com.back.global.security.config.CustomAuthenticationFilter
import com.back.global.security.config.LegacyPayloadRecoveryHandler
import com.back.global.security.config.MemberSessionAuthenticationResolver
import com.back.global.security.config.PublicApiRequestMatcher
import com.back.global.security.config.PublicApiRouteContributor
import com.back.global.security.config.RefreshTokenAuthenticationHandler
import com.back.global.security.config.SecurityConfig
import com.back.global.security.config.SecurityContextAuthenticationWriter
import com.back.global.security.config.oauth2.CustomOAuth2AuthorizationRequestResolver
import com.back.global.security.config.oauth2.CustomOAuth2LoginSuccessHandler
import com.back.global.security.config.oauth2.CustomOAuth2UserService
import com.back.global.security.config.oauth2.CustomOidcUserService
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.ClientIpResolver
import com.back.global.web.application.Rq
import org.assertj.core.api.Assertions.assertThat
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
import org.springframework.http.HttpHeaders
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

private const val STRICT_TRANSPORT_SECURITY_HEADER = "Strict-Transport-Security"

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
        ): CustomAuthenticationFilter {
            val rq = mock(Rq::class.java)
            val actorApplicationService = mock(ActorApplicationService::class.java)
            val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
            val authCookieService = mock(AuthCookieService::class.java)
            val securityContextAuthenticationWriter = SecurityContextAuthenticationWriter()
            val memberSessionAuthenticationResolver =
                MemberSessionAuthenticationResolver(
                    memberSessionUseCase = memberSessionUseCase,
                    authCookieService = authCookieService,
                    freshLookupGraceSeconds = 15,
                )
            val authIpSecurityVerifier =
                AuthIpSecurityVerifier(
                    mock(AuthIpSecurityService::class.java),
                    mock(AuthSecurityEventService::class.java),
                    authCookieService,
                    memberSessionUseCase,
                )
            val apiKeyAuthorityRefreshHandler =
                ApiKeyAuthorityRefreshHandler(
                    actorApplicationService = actorApplicationService,
                    memberSessionUseCase = memberSessionUseCase,
                    authCookieService = authCookieService,
                    authIpSecurityVerifier = authIpSecurityVerifier,
                    securityContextAuthenticationWriter = securityContextAuthenticationWriter,
                    memberSessionAuthenticationResolver = memberSessionAuthenticationResolver,
                    rq = rq,
                )
            val legacyPayloadRecoveryHandler =
                LegacyPayloadRecoveryHandler(
                    actorApplicationService = actorApplicationService,
                    memberSessionUseCase = memberSessionUseCase,
                    authCookieService = authCookieService,
                    securityContextAuthenticationWriter = securityContextAuthenticationWriter,
                    rq = rq,
                )
            val accessTokenAuthenticationHandler =
                AccessTokenAuthenticationHandler(
                    actorApplicationService = actorApplicationService,
                    memberSessionUseCase = memberSessionUseCase,
                    authIpSecurityVerifier = authIpSecurityVerifier,
                    securityContextAuthenticationWriter = securityContextAuthenticationWriter,
                    memberSessionAuthenticationResolver = memberSessionAuthenticationResolver,
                    apiKeyAuthorityRefreshHandler = apiKeyAuthorityRefreshHandler,
                    legacyPayloadRecoveryHandler = legacyPayloadRecoveryHandler,
                )
            val refreshTokenAuthenticationHandler =
                RefreshTokenAuthenticationHandler(
                    actorApplicationService = actorApplicationService,
                    memberSessionUseCase = memberSessionUseCase,
                    authCookieService = authCookieService,
                    authIpSecurityVerifier = authIpSecurityVerifier,
                    securityContextAuthenticationWriter = securityContextAuthenticationWriter,
                    rq = rq,
                )
            return CustomAuthenticationFilter(
                authTokenExtractor = AuthTokenExtractor(rq),
                accessTokenAuthenticationHandler = accessTokenAuthenticationHandler,
                refreshTokenAuthenticationHandler = refreshTokenAuthenticationHandler,
                clientIpResolver = mock(ClientIpResolver::class.java),
                objectMapper = objectMapper,
                publicApiRequestMatcher = PublicApiRequestMatcher(emptyList<PublicApiRouteContributor>()),
                apiCorsPolicy = apiCorsPolicy,
                environment = environment,
            )
        }
    }
}

@ActiveProfiles("prod")
@DisplayName("SecurityConfig prod endpoint exposure 테스트")
class SecurityConfigProdEndpointExposureWebMvcTest : SecurityConfigEndpointExposureWebMvcTestSupport() {
    @Test
    @DisplayName("prod에서는 edge proxy가 보안 헤더를 단일 책임으로 내려주도록 Spring 기본 헤더를 위임한다")
    fun `prod delegates default response security headers to edge proxy`() {
        val response =
            mvc
                .get("/actuator/health/liveness")
                .andExpect {
                    status { isInternalServerError() }
                }.andReturn()
                .response

        assertThat(response.getHeader("X-Content-Type-Options")).isNull()
        assertThat(response.getHeader("X-Frame-Options")).isNull()
        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL)).isNull()
        assertThat(response.getHeader(STRICT_TRANSPORT_SECURITY_HEADER)).isNull()
    }

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
    @DisplayName("non-prod에서는 proxy 보강 없이도 Spring 기본 보안 헤더를 유지한다")
    fun `non prod keeps spring security default response headers`() {
        val response =
            mvc
                .get("/actuator/info") {
                    secure = true
                }.andExpect {
                    status { isInternalServerError() }
                }.andReturn()
                .response

        assertThat(response.getHeader("X-Content-Type-Options")).isEqualTo("nosniff")
        assertThat(response.getHeader("X-Frame-Options")).isEqualTo("DENY")
        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL))
            .isEqualTo("no-cache, no-store, max-age=0, must-revalidate")
        assertThat(response.getHeader(HttpHeaders.PRAGMA)).isEqualTo("no-cache")
        assertThat(response.getHeader(HttpHeaders.EXPIRES)).isEqualTo("0")
        assertThat(response.getHeader(STRICT_TRANSPORT_SECURITY_HEADER))
            .isEqualTo("max-age=31536000 ; includeSubDomains")
    }

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
