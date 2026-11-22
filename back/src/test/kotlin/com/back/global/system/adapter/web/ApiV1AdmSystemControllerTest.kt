package com.back.global.system.adapter.web

import com.back.boundedContexts.post.application.service.PostSearchEngineMirrorService
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.security.application.AuthSecurityEventDto
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.UploadedFileCleanupDiagnostics
import com.back.global.storage.application.UploadedFileReconcileDiagnostics
import com.back.global.system.application.AdminDashboardAuthSecuritySnapshot
import com.back.global.system.application.AdminDashboardContentSnapshot
import com.back.global.system.application.AdminDashboardSnapshot
import com.back.global.system.application.AdminDashboardSnapshotService
import com.back.global.system.application.AdminDashboardStorageCleanupSnapshot
import com.back.global.system.application.AdminDashboardTaskQueueSnapshot
import com.back.global.system.application.AdminOperationService
import com.back.global.system.application.AdminSystemHealthSnapshotService
import com.back.global.system.application.SearchRuntimeControlQueryService
import com.back.global.system.model.AdminOperationAction
import com.back.global.system.model.AdminOperationResultCode
import com.back.global.system.model.AdminOperationStatus
import com.back.global.system.model.SearchRuntimeControlKey
import com.back.global.system.model.SearchRuntimeControlValue
import com.back.global.task.application.TaskExecutionSample
import com.back.global.task.application.TaskQueueDiagnostics
import com.back.global.task.application.TaskQueueDiagnosticsService
import com.back.global.task.application.TaskRetryPolicy
import com.back.global.task.application.TaskTypeDiagnostics
import com.back.global.task.domain.TaskStatus
import com.back.support.BaseAdmSystemControllerWebMvcTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.time.Instant
import java.util.UUID

@org.junit.jupiter.api.DisplayName("ApiV1AdmSystemController 테스트")
class ApiV1AdmSystemControllerTest : BaseAdmSystemControllerWebMvcTest() {
    @Test
    fun `관리자는 시스템 bootstrap을 조회할 수 있다`() {
        val securityUser =
            SecurityUser(
                id = 7L,
                username = "admin@example.com",
                password = "",
                nickname = "관리자",
                authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
            )
        given(adminSystemHealthSnapshotService.getHealthSummary())
            .willReturn(
                ApiV1AdmSystemController.HealthResBody(
                    status = "UP",
                    serverTime = Instant.parse("2026-04-03T00:00:00Z").toString(),
                    uptimeMs = 1234,
                    version = "test",
                    checks =
                        ApiV1AdmSystemController.HealthChecks(
                            db = "UP",
                            redis = "DISABLED",
                        ),
                ),
            )
        given(adminDashboardSnapshotService.getSnapshot()).willReturn(adminDashboardSnapshot())

        mvc
            .get("/system/api/v1/adm/bootstrap") {
                with(user(securityUser))
            }.andExpect {
                status { isOk() }
                jsonPath("$.member.id") { value(7) }
                jsonPath("$.member.isAdmin") { value(true) }
                jsonPath("$.member.nickname") { value("관리자") }
                jsonPath("$.health.status") { value("UP") }
                jsonPath("$.health.checks.db") { value("UP") }
                jsonPath("$.dashboard.taskQueue.failedCount") { value(1) }
                jsonPath("$.dashboard.authSecurity.blockedEventCount") { value(1) }
            }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 시스템 헬스 상태를 조회할 수 있다`() {
        given(adminSystemHealthSnapshotService.getHealthSummary())
            .willReturn(
                ApiV1AdmSystemController.HealthResBody(
                    status = "UP",
                    serverTime = Instant.parse("2026-04-03T00:00:00Z").toString(),
                    uptimeMs = 1234,
                    version = "test",
                    checks =
                        ApiV1AdmSystemController.HealthChecks(
                            db = "UP",
                            redis = "DISABLED",
                        ),
                ),
            )

        mvc.get("/system/api/v1/adm/health").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("UP") }
            jsonPath("$.serverTime") { isString() }
            jsonPath("$.uptimeMs") { isNumber() }
            jsonPath("$.version") { isString() }
            jsonPath("$.checks.db") { value("UP") }
            jsonPath("$.checks.redis") { value("DISABLED") }
        }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 fresh 플래그로 시스템 헬스를 즉시 재계산할 수 있다`() {
        given(adminSystemHealthSnapshotService.getFreshHealthSummary())
            .willReturn(
                ApiV1AdmSystemController.HealthResBody(
                    status = "UP",
                    serverTime = Instant.parse("2026-04-03T00:00:01Z").toString(),
                    uptimeMs = 2345,
                    version = "test",
                    checks =
                        ApiV1AdmSystemController.HealthChecks(
                            db = "UP",
                            redis = "UP",
                        ),
                ),
            )

        mvc
            .get("/system/api/v1/adm/health") {
                param("fresh", "true")
            }.andExpect {
                status { isOk() }
                jsonPath("$.checks.redis") { value("UP") }
            }
    }

    @Test
    fun `관리자는 grafana auth proxy 헤더를 조회할 수 있다`() {
        val securityUser =
            SecurityUser(
                id = 7L,
                username = "admin@example.com",
                password = "",
                nickname = "관리자",
                authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
            )

        mvc
            .get("/system/api/v1/adm/grafana/auth-proxy") {
                with(user(securityUser))
            }.andExpect {
                status { isNoContent() }
                header { string("X-WEBAUTH-USER", "admin@example.com") }
                header { string("X-WEBAUTH-NAME", "관리자") }
                header { string("Cache-Control", "private, no-store, max-age=0") }
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
    fun `관리자는 dashboard snapshot을 조회할 수 있다`() {
        given(adminDashboardSnapshotService.getSnapshot()).willReturn(adminDashboardSnapshot())

        mvc.get("/system/api/v1/adm/dashboard-snapshot").andExpect {
            status { isOk() }
            jsonPath("$.generatedAt") { isString() }
            jsonPath("$.taskQueue.readyPendingCount") { value(2) }
            jsonPath("$.taskQueue.failedCount") { value(1) }
            jsonPath("$.authSecurity.blockedEventCount") { value(1) }
            jsonPath("$.storageCleanup.eligibleForPurgeCount") { value(1) }
            jsonPath("$.content.totalPosts") { value(10) }
            jsonPath("$.content.publishedPosts") { value(7) }
            jsonPath("$.content.draftPosts") { value(2) }
            jsonPath("$.content.privatePosts") { value(1) }
            jsonPath("$.content.deletedPosts") { value(1) }
            jsonPath("$.content.totalHitCount") { value(100) }
            jsonPath("$.content.totalLikesCount") { value(25) }
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
    fun `관리자는 stable operation ID로 FAILED task replay를 제출할 수 있다`() {
        val securityUser =
            SecurityUser(
                id = 7L,
                username = "admin@example.com",
                password = "",
                nickname = "관리자",
                authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
                sessionRowId = 41L,
            )
        val operationId = UUID.fromString("f4791e0e-3857-4ef1-9fe7-2a9654a2208f")
        val expectedCommand =
            AdminOperationService.DlqReplayCommand(
                operationId = operationId,
                actorId = 7L,
                sessionRowId = 41L,
                taskType = null,
                limit = 50,
                resetRetryCount = true,
                reason = "incident recovery",
            )
        given(adminOperationService.submit(expectedCommand))
            .willReturn(operationResult(operationId, sessionRowId = 41L, replayedCount = 2))

        mvc
            .post("/system/api/v1/adm/operations/task-dlq-replay") {
                with(user(securityUser))
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "operationId":"$operationId",
                      "reason":"incident recovery",
                      "limit":50,
                      "resetRetryCount":true,
                      "actorId":999,
                      "sessionRowId":999
                    }
                    """.trimIndent()
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.resultCode") { value("202-40") }
                jsonPath("$.data.replayedCount") { value(2) }
                jsonPath("$.data.operationId") { value(operationId.toString()) }
                jsonPath("$.data.sessionRowId") { value(41) }
            }

        verify(adminOperationService).submit(expectedCommand)
    }

    @Test
    fun `관리자는 현재 operation 상태를 조회할 수 있다`() {
        val securityUser =
            SecurityUser(
                id = 7L,
                username = "admin@example.com",
                password = "",
                nickname = "관리자",
                authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
                sessionRowId = 41L,
            )
        val operationId = UUID.fromString("f4791e0e-3857-4ef1-9fe7-2a9654a2208f")
        given(adminOperationService.get(operationId, 7L)).willReturn(operationResult(operationId, sessionRowId = 41L))

        mvc
            .get("/system/api/v1/adm/operations/$operationId") {
                with(user(securityUser))
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-40") }
                jsonPath("$.data.action") { value("TASK_DLQ_REPLAY") }
                jsonPath("$.data.status") { value("SUCCEEDED") }
                jsonPath("$.data.resultCode") { value("TASKS_REPLAYED") }
                jsonPath("$.data.sessionRowId") { value(41) }
            }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `invalid replay operation request is rejected before service`() {
        val operationId = UUID.fromString("f4791e0e-3857-4ef1-9fe7-2a9654a2208f")

        listOf(
            """{"reason":"incident recovery"}""",
            """{"operationId":null,"reason":"incident recovery"}""",
            """{"operationId":"$operationId","reason":" "}""",
            """{"operationId":"$operationId","reason":"${"x".repeat(201)}"}""",
            """{"operationId":"$operationId","reason":"incident recovery","limit":201}""",
        ).forEach { request ->
            mvc
                .post("/system/api/v1/adm/operations/task-dlq-replay") {
                    contentType = org.springframework.http.MediaType.APPLICATION_JSON
                    content = request
                }.andExpect {
                    status { isBadRequest() }
                }
        }

        verifyNoInteractions(adminOperationService)
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `legacy unaudited replay route is absent`() {
        mvc
            .post("/system/api/v1/adm/tasks/replay-failed") {
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content = "{}"
            }.andExpect {
                status { isNotFound() }
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
            jsonPath("$.reconcile.repairMode") { value("dry-run") }
            jsonPath("$.reconcile.bucketOnlyObjectCount") { value(1) }
            jsonPath("$.reconcile.dbOnlyMissingObjectCount") { value(1) }
        }
    }

    @Test
    fun `시스템 관리자 컨트롤러는 Transactional을 두지 않고 DB 조회 서비스 경계에만 readOnly Transactional을 둔다`() {
        assertThat(ApiV1AdmSystemController::class.java.isAnnotationPresent(Transactional::class.java)).isFalse()

        val expectedNonTxMethods =
            setOf(
                "bootstrap",
                "health",
                "grafanaAuthProxy",
                "taskQueueDiagnostics",
                "listDlqTasks",
                "dashboardSnapshot",
                "authSecurityEvents",
                "getSearchRuntimeFlags",
                "uploadedFileCleanupDiagnostics",
            )
        val declaredMethodNames =
            ApiV1AdmSystemController::class.java.declaredMethods
                .map { it.name }
                .toSet()
        assertThat(declaredMethodNames).containsAll(expectedNonTxMethods)

        ApiV1AdmSystemController::class.java.declaredMethods.forEach { method ->
            assertThat(method.isAnnotationPresent(Transactional::class.java))
                .describedAs("Controller method %s must not carry @Transactional", method.name)
                .isFalse()
        }

        assertThat(AdminSystemHealthSnapshotService::class.java.isAnnotationPresent(Transactional::class.java)).isFalse()
        AdminSystemHealthSnapshotService::class.java.declaredMethods.forEach { method ->
            assertThat(method.isAnnotationPresent(Transactional::class.java))
                .describedAs("Health service method %s must not hold DB transaction across Redis check", method.name)
                .isFalse()
        }

        val dashboardSnapshotTx =
            AdminDashboardSnapshotService::class.java
                .getDeclaredMethod("getSnapshot")
                .getAnnotation(Transactional::class.java)
        assertThat(dashboardSnapshotTx).isNotNull
        assertThat(dashboardSnapshotTx.readOnly).isTrue()

        val taskDiagnosticsTx =
            TaskQueueDiagnosticsService::class.java
                .getDeclaredMethod("diagnoseQueue")
                .getAnnotation(Transactional::class.java)
        assertThat(taskDiagnosticsTx).isNotNull
        assertThat(taskDiagnosticsTx.readOnly).isTrue()

        val authSecurityEventsTx =
            AuthSecurityEventService::class.java
                .getDeclaredMethod("getRecent", Int::class.javaPrimitiveType)
                .getAnnotation(Transactional::class.java)
        assertThat(authSecurityEventsTx).isNotNull
        assertThat(authSecurityEventsTx.readOnly).isTrue()

        val searchRuntimeSnapshotTx =
            SearchRuntimeControlQueryService::class.java
                .getDeclaredMethod("runtimeSnapshot")
                .getAnnotation(Transactional::class.java)
        assertThat(searchRuntimeSnapshotTx).isNotNull
        assertThat(searchRuntimeSnapshotTx.readOnly).isTrue()
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `업로드 파일 cleanup 진단은 컨트롤러 트랜잭션 없이 실행된다`() {
        var txActiveInControllerCall = true
        given(uploadedFileRetentionService.diagnoseCleanup()).willAnswer {
            txActiveInControllerCall = TransactionSynchronizationManager.isActualTransactionActive()
            uploadedFileCleanupDiagnostics()
        }

        mvc.get("/system/api/v1/adm/storage/cleanup").andExpect {
            status { isOk() }
            jsonPath("$.reconcile.repairMode") { value("dry-run") }
        }

        assertThat(txActiveInControllerCall).isFalse()
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 검색 런타임 플래그를 조회할 수 있다`() {
        given(searchRuntimeControlQueryService.runtimeSnapshot())
            .willReturn(runtimeSnapshot())
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
            jsonPath("$.searchPipeline.controlKey") { value("PIPELINE_FORCE_CONTROL") }
            jsonPath("$.searchPipeline.controlValue") { value("ENABLED") }
            jsonPath("$.searchPipeline.version") { value(3) }
            jsonPath("$.searchPipeline.modifiedAt") { value("2026-08-26T00:00:00Z") }
            jsonPath("$.searchPipelineForceControlEnabled") { value(true) }
            jsonPath("$.searchEngineMirror.controlKey") { value("MIRROR_FORCE_DISABLE") }
            jsonPath("$.searchEngineMirror.controlValue") { value("ENABLED") }
            jsonPath("$.searchEngineMirror.version") { value(4) }
            jsonPath("$.searchEngineMirrorForceDisabled") { value(false) }
            jsonPath("$.searchEngineMirrorCircuitOpen") { value(true) }
            jsonPath("$.searchEngineMirrorCircuitRemainingSeconds") { value(52) }
            jsonPath("$.searchEngineMirrorConsecutiveFailures") { value(5) }
            jsonPath("$.searchEngineMirrorFailureThreshold") { value(5) }
        }
    }

    @Test
    fun `관리자는 검색 파이프라인 force-control 플래그를 갱신할 수 있다`() {
        val securityUser = adminSecurityUser()
        val operationId = UUID.fromString("2390fddf-efb7-4e7a-97eb-3af3943770bc")
        val command =
            AdminOperationService.SearchPipelineForceControlCommand(
                operationId = operationId,
                actorId = 7L,
                sessionRowId = 41L,
                forceControl = true,
                reason = "pipeline incident",
            )
        given(adminOperationService.submitPipelineForceControl(command))
            .willReturn(
                operationResult(operationId, 41L).copy(
                    action = AdminOperationAction.SEARCH_PIPELINE_FORCE_CONTROL,
                    target = "PIPELINE_FORCE_CONTROL",
                    resultCode = AdminOperationResultCode.SEARCH_PIPELINE_FORCE_CONTROL_UPDATED,
                    controlKey = SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL,
                    controlValue = SearchRuntimeControlValue.ENABLED,
                    controlVersion = 1,
                ),
            )

        mvc
            .post("/system/api/v1/adm/search/pipeline/force-control") {
                with(user(securityUser))
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content =
                    """{"operationId":"$operationId","reason":"pipeline incident","forceControl":true,""" +
                    """"actorId":999,"sessionRowId":999}"""
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.resultCode") { value("202-41") }
                jsonPath("$.data.controlKey") { value("PIPELINE_FORCE_CONTROL") }
                jsonPath("$.data.controlValue") { value("ENABLED") }
                jsonPath("$.data.controlVersion") { value(1) }
            }
        verify(adminOperationService).submitPipelineForceControl(command)
    }

    @Test
    fun `관리자는 검색엔진 미러 force-disable 플래그를 갱신할 수 있다`() {
        val securityUser = adminSecurityUser()
        val operationId = UUID.fromString("0cb362ec-906a-471d-967d-8d35a8e07b25")
        val command =
            AdminOperationService.SearchEngineMirrorForceDisableCommand(
                operationId = operationId,
                actorId = 7L,
                sessionRowId = 41L,
                forceDisabled = true,
                reason = "mirror incident",
            )
        given(adminOperationService.submitSearchEngineMirrorForceDisable(command))
            .willReturn(
                operationResult(operationId, 41L).copy(
                    action = AdminOperationAction.SEARCH_ENGINE_MIRROR_FORCE_DISABLE,
                    target = "MIRROR_FORCE_DISABLE",
                    resultCode = AdminOperationResultCode.SEARCH_ENGINE_MIRROR_FORCE_DISABLE_UPDATED,
                    controlKey = SearchRuntimeControlKey.MIRROR_FORCE_DISABLE,
                    controlValue = SearchRuntimeControlValue.DISABLED,
                    controlVersion = 1,
                ),
            )

        mvc
            .post("/system/api/v1/adm/search-engine/mirror/force-disable") {
                with(user(securityUser))
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content =
                    """{"operationId":"$operationId","reason":"mirror incident","forceDisabled":true,""" +
                    """"actorId":999,"sessionRowId":999}"""
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.resultCode") { value("202-42") }
                jsonPath("$.data.controlKey") { value("MIRROR_FORCE_DISABLE") }
                jsonPath("$.data.controlValue") { value("DISABLED") }
                jsonPath("$.data.controlVersion") { value(1) }
            }
        verify(adminOperationService).submitSearchEngineMirrorForceDisable(command)
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `invalid search control operation requests are rejected before service`() {
        listOf(
            """{"reason":"incident"}""",
            """{"operationId":null,"reason":"incident"}""",
            """{"operationId":"${UUID.randomUUID()}","reason":" "}""",
            """{"operationId":"${UUID.randomUUID()}","reason":"${"x".repeat(201)}"}""",
        ).forEach { request ->
            mvc
                .post("/system/api/v1/adm/search/pipeline/force-control") {
                    contentType = org.springframework.http.MediaType.APPLICATION_JSON
                    content = request
                }.andExpect {
                    status { isBadRequest() }
                }
        }
        verifyNoInteractions(adminOperationService)
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `search control service unavailability returns retryable 503`() {
        given(searchRuntimeControlQueryService.runtimeSnapshot())
            .willThrow(AppException(ErrorCode.SERVICE_UNAVAILABLE))

        mvc.get("/system/api/v1/adm/search/runtime-flags").andExpect {
            status { isServiceUnavailable() }
            jsonPath("$.resultCode") { value("503-1") }
            header { string("Retry-After", "1") }
        }
    }

    @Test
    fun `search control admission unavailability returns retryable 503`() {
        val securityUser = adminSecurityUser()
        val operationId = UUID.fromString("783459dc-3353-4d57-8fed-1b84b0c0f021")
        given(
            adminOperationService.submitPipelineForceControl(
                AdminOperationService.SearchPipelineForceControlCommand(
                    operationId = operationId,
                    actorId = 7L,
                    sessionRowId = 41L,
                    forceControl = null,
                    reason = "incident",
                ),
            ),
        ).willThrow(AppException(ErrorCode.SERVICE_UNAVAILABLE))

        mvc
            .post("/system/api/v1/adm/search/pipeline/force-control") {
                with(user(securityUser))
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content = """{"operationId":"$operationId","reason":"incident"}"""
            }.andExpect {
                status { isServiceUnavailable() }
                jsonPath("$.resultCode") { value("503-1") }
                header { string("Retry-After", "1") }
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

    private fun operationResult(
        operationId: UUID,
        sessionRowId: Long?,
        replayedCount: Int = 1,
    ) = AdminOperationService.OperationResult(
        operationId = operationId,
        actorId = 7L,
        sessionRowId = sessionRowId,
        action = AdminOperationAction.TASK_DLQ_REPLAY,
        target = "ALL_FAILED_TASKS",
        reason = "incident recovery",
        status = AdminOperationStatus.SUCCEEDED,
        resultCode = AdminOperationResultCode.TASKS_REPLAYED,
        selectedCount = replayedCount,
        replayedCount = replayedCount,
        quarantinedCount = 0,
        createdAt = Instant.parse("2026-08-24T00:00:00Z"),
        modifiedAt = Instant.parse("2026-08-24T00:00:01Z"),
    )

    private fun runtimeSnapshot() =
        SearchRuntimeControlQueryService.RuntimeSnapshot(
            searchPipeline =
                SearchRuntimeControlQueryService.ControlStateSnapshot(
                    controlKey = SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL,
                    controlValue = SearchRuntimeControlValue.ENABLED,
                    version = 3,
                    modifiedAt = Instant.parse("2026-08-26T00:00:00Z"),
                ),
            searchPipelineForceControlEnabled = true,
            searchEngineMirror =
                SearchRuntimeControlQueryService.ControlStateSnapshot(
                    controlKey = SearchRuntimeControlKey.MIRROR_FORCE_DISABLE,
                    controlValue = SearchRuntimeControlValue.ENABLED,
                    version = 4,
                    modifiedAt = Instant.parse("2026-08-26T00:00:01Z"),
                ),
            searchEngineMirrorForceDisabled = false,
        )

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 DLQ 실패 태스크 목록을 경량 프로젝션으로 조회할 수 있다`() {
        val now = Instant.parse("2026-11-15T10:00:00Z")
        val dlqItems =
            listOf(
                com.back.global.task.application.port.output.TaskDlqItemDto(
                    id = 10L,
                    uid = UUID.randomUUID(),
                    taskType = "POST_SEARCH_INDEX",
                    aggregateType = "POST",
                    aggregateId = 100L,
                    retryCount = 3,
                    maxRetries = 3,
                    errorMessage = "Search engine timeout",
                    createdAt = now.minusSeconds(300),
                    modifiedAt = now,
                ),
            )
        given(taskDlqReplayRepository.findDlqTasks("POST_SEARCH_INDEX", 50)).willReturn(dlqItems)

        mvc
            .get("/system/api/v1/adm/tasks/dlq") {
                param("taskType", "POST_SEARCH_INDEX")
                param("limit", "50")
            }.andExpect {
                status { isOk() }
                jsonPath("$.tasks.length()") { value(1) }
                jsonPath("$.tasks[0].id") { value(10) }
                jsonPath("$.tasks[0].taskType") { value("POST_SEARCH_INDEX") }
                jsonPath("$.tasks[0].errorMessage") { value("Search engine timeout") }
            }

        verify(taskDlqReplayRepository).findDlqTasks("POST_SEARCH_INDEX", 50)
    }

    @Test
    fun `관리자는 taskIds를 지정하여 선별적 DLQ 리플레이 작업을 요청할 수 있다`() {
        val securityUser =
            SecurityUser(
                id = 7L,
                username = "admin@example.com",
                password = "",
                nickname = "관리자",
                authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
                sessionRowId = 41L,
            )
        val operationId = UUID.randomUUID()
        val expectedCommand =
            AdminOperationService.DlqReplayCommand(
                operationId = operationId,
                actorId = 7L,
                sessionRowId = 41L,
                taskType = "POST_SEARCH_INDEX",
                limit = 10,
                resetRetryCount = true,
                reason = "selective retry",
                taskIds = listOf(10L, 20L),
            )
        given(adminOperationService.submit(expectedCommand))
            .willReturn(operationResult(operationId, sessionRowId = 41L, replayedCount = 2))

        mvc
            .post("/system/api/v1/adm/operations/task-dlq-replay") {
                with(user(securityUser))
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "operationId":"$operationId",
                      "reason":"selective retry",
                      "taskType":"POST_SEARCH_INDEX",
                      "limit":10,
                      "resetRetryCount":true,
                      "taskIds":[10,20]
                    }
                    """.trimIndent()
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.resultCode") { value("202-40") }
                jsonPath("$.data.operationId") { value(operationId.toString()) }
                jsonPath("$.data.action") { value("TASK_DLQ_REPLAY") }
                jsonPath("$.data.status") { value("SUCCEEDED") }
            }

        verify(adminOperationService).submit(expectedCommand)
    }

    private fun adminSecurityUser() =
        SecurityUser(
            id = 7L,
            username = "admin@example.com",
            password = "",
            nickname = "관리자",
            authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
            sessionRowId = 41L,
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
            reconcile =
                UploadedFileReconcileDiagnostics(
                    objectPrefix = "posts/",
                    inventoryLimit = 1000,
                    inventoryObjectCount = 2,
                    inventoryTruncated = false,
                    bucketOnlyObjectCount = 1,
                    sampleBucketOnlyObjectKeys = listOf("posts/2026/orphan.png"),
                    dbOnlyMissingObjectCount = 1,
                    sampleDbOnlyObjectKeys = listOf("posts/2026/missing.png"),
                    longLivedPendingDeleteCount = 1,
                    sampleLongLivedPendingDeleteObjectKeys = listOf("posts/2026/old-pending.png"),
                ),
        )

    private fun adminDashboardSnapshot(): AdminDashboardSnapshot =
        AdminDashboardSnapshot(
            generatedAt = Instant.parse("2026-03-13T00:03:00Z"),
            taskQueue =
                AdminDashboardTaskQueueSnapshot(
                    pendingCount = 3,
                    readyPendingCount = 2,
                    processingCount = 1,
                    failedCount = 1,
                    staleProcessingCount = 0,
                    oldestReadyPendingAgeSeconds = 30,
                    latestFailureAt = Instant.parse("2026-03-13T00:02:00Z"),
                    latestFailureMessage = "smtp timeout",
                ),
            authSecurity =
                AdminDashboardAuthSecuritySnapshot(
                    recentEventCount = 3,
                    blockedEventCount = 1,
                    latestEventAt = Instant.parse("2026-03-13T00:03:00Z"),
                    latestBlockedAt = Instant.parse("2026-03-13T00:01:00Z"),
                ),
            storageCleanup =
                AdminDashboardStorageCleanupSnapshot(
                    eligibleForPurgeCount = 1,
                    blockedBySafetyThreshold = false,
                    oldestEligiblePurgeAfter = Instant.parse("2026-03-13T00:00:00Z"),
                ),
            content =
                AdminDashboardContentSnapshot(
                    totalPosts = 10,
                    publishedPosts = 7,
                    draftPosts = 2,
                    privatePosts = 1,
                    deletedPosts = 1,
                    totalHitCount = 100,
                    totalLikesCount = 25,
                ),
        )
}
