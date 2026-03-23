package com.back.global.system.adapter.web

import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupMailDiagnostics
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupMailDiagnosticsService
import com.back.boundedContexts.post.application.service.PostKeywordSearchPipelineService
import com.back.boundedContexts.post.application.service.PostSearchEngineMirrorService
import com.back.global.security.application.AuthSecurityEventDto
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.security.config.CustomAuthenticationFilter
import com.back.global.storage.application.UploadedFileCleanupDiagnostics
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.task.application.TaskDlqReplayResult
import com.back.global.task.application.TaskDlqReplayService
import com.back.global.task.application.TaskExecutionSample
import com.back.global.task.application.TaskQueueDiagnostics
import com.back.global.task.application.TaskQueueDiagnosticsService
import com.back.global.task.application.TaskRetryPolicy
import com.back.global.task.application.TaskTypeDiagnostics
import com.back.global.task.domain.TaskStatus
import org.hamcrest.Matchers.anyOf
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.ComponentScan
import org.springframework.context.annotation.FilterType
import org.springframework.context.annotation.Import
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Instant

@ActiveProfiles("test")
@WebMvcTest(
    ApiV1AdmSystemController::class,
    excludeFilters = [
        ComponentScan.Filter(
            type = FilterType.ASSIGNABLE_TYPE,
            classes = [CustomAuthenticationFilter::class],
        ),
    ],
)
@Import(ApiV1AdmSystemControllerTest.TestSecurityConfig::class)
@org.junit.jupiter.api.DisplayName("ApiV1AdmSystemController 테스트")
class ApiV1AdmSystemControllerTest {
    @Autowired
    private lateinit var mvc: MockMvc

    @MockitoBean
    private lateinit var jdbcTemplate: JdbcTemplate

    @MockitoBean
    private lateinit var signupMailDiagnosticsService: SignupMailDiagnosticsService

    @MockitoBean
    private lateinit var authSecurityEventService: AuthSecurityEventService

    @MockitoBean
    private lateinit var taskQueueDiagnosticsService: TaskQueueDiagnosticsService

    @MockitoBean
    private lateinit var taskDlqReplayService: TaskDlqReplayService

    @MockitoBean
    private lateinit var uploadedFileRetentionService: UploadedFileRetentionService

    @MockitoBean
    private lateinit var postKeywordSearchPipelineService: PostKeywordSearchPipelineService

    @MockitoBean
    private lateinit var postSearchEngineMirrorService: PostSearchEngineMirrorService

    @MockitoBean(name = "jpaMappingContext")
    private lateinit var jpaMappingContext: JpaMetamodelMappingContext

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 시스템 헬스 상태를 조회할 수 있다`() {
        given(jdbcTemplate.queryForObject("SELECT 1", Int::class.java)).willReturn(1)
        given(signupMailDiagnosticsService.diagnose(false)).willReturn(readySignupMailDiagnostics())

        mvc.get("/system/api/v1/adm/health").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("UP") }
            jsonPath("$.serverTime") { isString() }
            jsonPath("$.uptimeMs") { isNumber() }
            jsonPath("$.version") { isString() }
            jsonPath("$.checks.db") { value("UP") }
            jsonPath("$.checks.redis") { value("DISABLED") }
            jsonPath("$.checks.signupMail") { value(anyOf(equalTo("TEST_MODE"), equalTo("READY"), equalTo("MISCONFIGURED"))) }
        }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 회원가입 메일 진단 상태를 조회할 수 있다`() {
        given(signupMailDiagnosticsService.diagnose(false)).willReturn(readySignupMailDiagnostics())

        mvc.get("/system/api/v1/adm/mail/signup").andExpect {
            status { isOk() }
            jsonPath("$.status") { value(anyOf(equalTo("TEST_MODE"), equalTo("READY"), equalTo("MISCONFIGURED"))) }
            jsonPath("$.adapter") { isString() }
            jsonPath("$.verifyPath") { value("/signup/verify") }
        }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 회원가입 테스트 메일 발송을 요청할 수 있다`() {
        mvc
            .post("/system/api/v1/adm/mail/signup/test") {
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "email": "tester@example.com"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.resultCode") { value("202-3") }
                jsonPath("$.data.email") { value("tester@example.com") }
            }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 task queue 진단 상태를 조회할 수 있다`() {
        given(taskQueueDiagnosticsService.diagnoseQueue()).willReturn(taskQueueDiagnostics())

        mvc.get("/system/api/v1/adm/tasks").andExpect {
            status { isOk() }
            jsonPath("$.pendingCount") { isNumber() }
            jsonPath("$.readyPendingCount") { isNumber() }
            jsonPath("$.processingCount") { isNumber() }
            jsonPath("$.staleProcessingCount") { isNumber() }
            jsonPath("$.processingTimeoutSeconds") { isNumber() }
            jsonPath("$.taskTypes") { isArray() }
            jsonPath("$.taskTypes[0].taskType") { isString() }
            jsonPath("$.taskTypes[0].label") { isString() }
            jsonPath("$.taskTypes[0].backlogCount") { isNumber() }
            jsonPath("$.taskTypes[0].queueLagSeconds") { isNumber() }
            jsonPath("$.taskTypes[0].retryPolicy.maxRetries") { isNumber() }
            jsonPath("$.taskTypes[0].retryPolicy.baseDelaySeconds") { isNumber() }
            jsonPath("$.recentFailures") { isArray() }
            jsonPath("$.staleProcessingSamples") { isArray() }
        }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 인증 보안 이벤트 목록을 조회할 수 있다`() {
        given(authSecurityEventService.getRecent(30))
            .willReturn(
                listOf(
                    AuthSecurityEventDto(
                        id = 101,
                        createdAt = Instant.parse("2026-03-23T00:00:00Z"),
                        eventType = "LOGIN_POLICY_APPLIED",
                        memberId = 1,
                        loginIdentifier = "admin@example.com",
                        rememberLoginEnabled = true,
                        ipSecurityEnabled = true,
                        clientIpFingerprint = "fingerprint-***",
                        requestPath = "/member/api/v1/auth/login",
                        reason = null,
                    ),
                ),
            )

        mvc.get("/system/api/v1/adm/auth/security-events").andExpect {
            status { isOk() }
            jsonPath("$[0].eventType") { value("LOGIN_POLICY_APPLIED") }
            jsonPath("$[0].memberId") { value(1) }
            jsonPath("$[0].loginIdentifier") { value("admin@example.com") }
            jsonPath("$[0].ipSecurityEnabled") { value(true) }
            jsonPath("$[0].requestPath") { value("/member/api/v1/auth/login") }
        }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 FAILED task를 replay할 수 있다`() {
        given(taskDlqReplayService.replayFailedTasks(null, 50, true))
            .willReturn(
                TaskDlqReplayResult(
                    taskType = null,
                    requestedLimit = 50,
                    replayedCount = 2,
                    resetRetryCount = true,
                    replayedTaskIds = listOf(101, 102),
                ),
            )

        mvc
            .post("/system/api/v1/adm/tasks/replay-failed") {
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content = """{"taskType":null,"limit":50,"resetRetryCount":true}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-10") }
                jsonPath("$.data.replayedCount") { value(2) }
                jsonPath("$.data.replayedTaskIds[0]") { value(101) }
            }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 업로드 파일 cleanup 진단 상태를 조회할 수 있다`() {
        given(uploadedFileRetentionService.diagnoseCleanup()).willReturn(uploadedFileCleanupDiagnostics())

        mvc.get("/system/api/v1/adm/storage/cleanup").andExpect {
            status { isOk() }
            jsonPath("$.tempCount") { isNumber() }
            jsonPath("$.pendingDeleteCount") { isNumber() }
            jsonPath("$.eligibleForPurgeCount") { isNumber() }
            jsonPath("$.cleanupSafetyThreshold") { isNumber() }
            jsonPath("$.sampleEligibleObjectKeys") { isArray() }
        }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 검색 런타임 플래그를 조회할 수 있다`() {
        given(postKeywordSearchPipelineService.isForceControlEnabled()).willReturn(true)
        given(postKeywordSearchPipelineService.isForceControlRuntimeOverridden()).willReturn(true)
        given(postSearchEngineMirrorService.isRuntimeForceDisabled()).willReturn(false)
        given(postSearchEngineMirrorService.getCircuitStatus())
            .willReturn(
                PostSearchEngineMirrorService.MirrorCircuitStatus(
                    open = true,
                    openUntilEpochMs = 1_742_211_200_000,
                    remainingSeconds = 52,
                    consecutiveFailures = 5,
                    failureThreshold = 5,
                ),
            )

        mvc.get("/system/api/v1/adm/search/runtime-flags").andExpect {
            status { isOk() }
            jsonPath("$.searchPipelineForceControlEnabled") { value(true) }
            jsonPath("$.searchPipelineRuntimeOverride") { value(true) }
            jsonPath("$.searchEngineMirrorForceDisabled") { value(false) }
            jsonPath("$.searchEngineMirrorCircuitOpen") { value(true) }
            jsonPath("$.searchEngineMirrorCircuitRemainingSeconds") { value(52) }
            jsonPath("$.searchEngineMirrorConsecutiveFailures") { value(5) }
            jsonPath("$.searchEngineMirrorFailureThreshold") { value(5) }
        }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 검색 파이프라인 force-control 플래그를 갱신할 수 있다`() {
        given(postKeywordSearchPipelineService.isForceControlEnabled()).willReturn(true)
        given(postKeywordSearchPipelineService.isForceControlRuntimeOverridden()).willReturn(true)
        given(postSearchEngineMirrorService.isRuntimeForceDisabled()).willReturn(false)
        given(postSearchEngineMirrorService.getCircuitStatus())
            .willReturn(
                PostSearchEngineMirrorService.MirrorCircuitStatus(
                    open = false,
                    openUntilEpochMs = 0,
                    remainingSeconds = 0,
                    consecutiveFailures = 0,
                    failureThreshold = 5,
                ),
            )

        mvc
            .post("/system/api/v1/adm/search/pipeline/force-control") {
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content = """{"forceControl":true}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-11") }
                jsonPath("$.data.searchPipelineForceControlEnabled") { value(true) }
            }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 검색엔진 미러 force-disable 플래그를 갱신할 수 있다`() {
        given(postKeywordSearchPipelineService.isForceControlEnabled()).willReturn(false)
        given(postKeywordSearchPipelineService.isForceControlRuntimeOverridden()).willReturn(false)
        given(postSearchEngineMirrorService.isRuntimeForceDisabled()).willReturn(true)
        given(postSearchEngineMirrorService.getCircuitStatus())
            .willReturn(
                PostSearchEngineMirrorService.MirrorCircuitStatus(
                    open = false,
                    openUntilEpochMs = 0,
                    remainingSeconds = 0,
                    consecutiveFailures = 0,
                    failureThreshold = 5,
                ),
            )

        mvc
            .post("/system/api/v1/adm/search-engine/mirror/force-disable") {
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content = """{"forceDisabled":true}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-12") }
                jsonPath("$.data.searchEngineMirrorForceDisabled") { value(true) }
            }
    }

    @Test
    @WithMockUser(roles = ["USER"])
    fun `일반 사용자는 시스템 헬스 상태를 조회할 수 없다`() {
        mvc.get("/system/api/v1/adm/health").andExpect {
            status { isForbidden() }
            jsonPath("$.resultCode") { value("403-1") }
            jsonPath("$.msg") { value("권한이 없습니다.") }
        }
    }

    @Test
    fun `비로그인 사용자는 시스템 헬스 상태를 조회할 수 없다`() {
        mvc.get("/system/api/v1/adm/health").andExpect {
            status { isUnauthorized() }
            jsonPath("$.resultCode") { value("401-1") }
            jsonPath("$.msg") { value("로그인 후 이용해주세요.") }
        }
    }

    private fun readySignupMailDiagnostics(): SignupMailDiagnostics =
        SignupMailDiagnostics(
            status = "READY",
            adapter = "SmtpSignupVerificationMailSenderAdapter",
            host = "smtp.gmail.com",
            port = 587,
            mailFrom = "aquilaxk10@gmail.com",
            usernameConfigured = true,
            passwordConfigured = true,
            smtpAuth = true,
            startTlsEnabled = true,
            missing = emptyList(),
            canConnect = true,
            connectionError = null,
            checkedAt = Instant.parse("2026-03-13T00:00:00Z"),
            verifyPath = "/signup/verify",
            taskQueue = sampleTaskTypeDiagnostics(),
        )

    private fun taskQueueDiagnostics(): TaskQueueDiagnostics =
        TaskQueueDiagnostics(
            pendingCount = 3,
            readyPendingCount = 2,
            delayedPendingCount = 1,
            processingCount = 1,
            completedCount = 8,
            failedCount = 1,
            staleProcessingCount = 0,
            oldestReadyPendingAt = Instant.parse("2026-03-13T00:00:00Z"),
            oldestProcessingAt = Instant.parse("2026-03-13T00:01:00Z"),
            oldestReadyPendingAgeSeconds = 30,
            oldestProcessingAgeSeconds = 10,
            processingTimeoutSeconds = 900,
            taskTypes = listOf(sampleTaskTypeDiagnostics()),
            recentFailures =
                listOf(
                    TaskExecutionSample(
                        taskId = 1,
                        taskType = "signupVerificationMail",
                        label = "회원가입 인증 메일 발송",
                        aggregateType = "memberSignupVerification",
                        aggregateId = 7,
                        status = TaskStatus.FAILED,
                        retryCount = 2,
                        maxRetries = 6,
                        modifiedAt = Instant.parse("2026-03-13T00:02:00Z"),
                        nextRetryAt = Instant.parse("2026-03-13T00:05:00Z"),
                        errorMessage = "smtp timeout",
                    ),
                ),
            staleProcessingSamples = emptyList(),
        )

    private fun sampleTaskTypeDiagnostics(): TaskTypeDiagnostics =
        TaskTypeDiagnostics(
            taskType = "signupVerificationMail",
            label = "회원가입 인증 메일 발송",
            pendingCount = 2,
            readyPendingCount = 1,
            delayedPendingCount = 1,
            processingCount = 0,
            backlogCount = 2,
            queueLagSeconds = 30,
            failedCount = 1,
            staleProcessingCount = 0,
            oldestReadyPendingAt = Instant.parse("2026-03-13T00:00:00Z"),
            oldestReadyPendingAgeSeconds = 30,
            latestFailureAt = Instant.parse("2026-03-13T00:02:00Z"),
            latestFailureMessage = "smtp timeout",
            retryPolicy =
                TaskRetryPolicy(
                    label = "회원가입 인증 메일 발송",
                    maxRetries = 6,
                    baseDelaySeconds = 60,
                    backoffMultiplier = 2.0,
                    maxDelaySeconds = 3600,
                ),
        )

    private fun uploadedFileCleanupDiagnostics(): UploadedFileCleanupDiagnostics =
        UploadedFileCleanupDiagnostics(
            tempCount = 2,
            activeCount = 4,
            pendingDeleteCount = 1,
            deletedCount = 8,
            eligibleForPurgeCount = 1,
            cleanupSafetyThreshold = 25,
            blockedBySafetyThreshold = false,
            oldestEligiblePurgeAfter = Instant.parse("2026-03-13T00:00:00Z"),
            sampleEligibleObjectKeys = listOf("posts/2026/test.png"),
        )

    @TestConfiguration
    class TestSecurityConfig {
        @Bean
        fun filterChain(http: HttpSecurity): SecurityFilterChain {
            http {
                authorizeHttpRequests {
                    authorize("/system/api/v1/adm/**", hasRole("ADMIN"))
                    authorize(anyRequest, permitAll)
                }

                csrf { disable() }
                formLogin { disable() }
                logout { disable() }
                httpBasic { disable() }

                sessionManagement {
                    sessionCreationPolicy = SessionCreationPolicy.STATELESS
                }

                exceptionHandling {
                    authenticationEntryPoint =
                        AuthenticationEntryPoint { _, response, _ ->
                            response.contentType = "$APPLICATION_JSON_VALUE; charset=UTF-8"
                            response.status = 401
                            response.writer.write("""{"resultCode":"401-1","msg":"로그인 후 이용해주세요."}""")
                        }

                    accessDeniedHandler =
                        AccessDeniedHandler { _, response, _ ->
                            response.contentType = "$APPLICATION_JSON_VALUE; charset=UTF-8"
                            response.status = 403
                            response.writer.write("""{"resultCode":"403-1","msg":"권한이 없습니다."}""")
                        }
                }
            }

            return http.build()
        }
    }
}
