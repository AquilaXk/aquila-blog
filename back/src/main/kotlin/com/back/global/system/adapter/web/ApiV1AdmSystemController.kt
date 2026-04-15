package com.back.global.system.adapter.web

import com.back.boundedContexts.member.dto.AuthSessionMemberDto
import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationSseService
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupMailDiagnostics
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupMailDiagnosticsService
import com.back.boundedContexts.post.application.service.PostKeywordSearchPipelineService
import com.back.boundedContexts.post.application.service.PostSearchEngineMirrorService
import com.back.global.rsData.RsData
import com.back.global.security.application.AuthSecurityEventDto
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.UploadedFileCleanupDiagnostics
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.system.application.AdminDashboardSnapshot
import com.back.global.system.application.AdminDashboardSnapshotService
import com.back.global.system.application.AdminSystemHealthSnapshotService
import com.back.global.task.application.TaskDlqReplayResult
import com.back.global.task.application.TaskDlqReplayService
import com.back.global.task.application.TaskQueueDiagnostics
import com.back.global.task.application.TaskQueueDiagnosticsService
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/**
 * ApiV1AdmSystemController는 글로벌 운영 API 요청을 처리하는 웹 어댑터입니다.
 * 요청 파라미터를 검증하고 애플리케이션 계층 결과를 응답 규격으로 변환합니다.
 */
@RestController
@RequestMapping("/system/api/v1/adm")
class ApiV1AdmSystemController(
    private val authSecurityEventService: AuthSecurityEventService,
    private val signupMailDiagnosticsService: SignupMailDiagnosticsService,
    private val memberNotificationSseService: MemberNotificationSseService,
    private val taskQueueDiagnosticsService: TaskQueueDiagnosticsService,
    private val taskDlqReplayService: TaskDlqReplayService,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
    private val postKeywordSearchPipelineService: PostKeywordSearchPipelineService,
    private val postSearchEngineMirrorService: PostSearchEngineMirrorService,
    private val adminSystemHealthSnapshotService: AdminSystemHealthSnapshotService,
    private val adminDashboardSnapshotService: AdminDashboardSnapshotService,
) {
    data class AdminSystemBootstrapResBody(
        val member: AuthSessionMemberDto,
        val health: HealthResBody,
        val dashboard: AdminDashboardSnapshot,
    )

    data class HealthChecks(
        val db: String,
        val redis: String,
        val signupMail: String,
    )

    data class HealthResBody(
        val status: String,
        val serverTime: String,
        val uptimeMs: Long,
        val version: String,
        val checks: HealthChecks,
    )

    data class SignupMailTestRequest(
        @field:Email
        @field:NotBlank
        val email: String,
    )

    data class TaskDlqReplayRequest(
        val taskType: String? = null,
        val limit: Int = 50,
        val resetRetryCount: Boolean = true,
    )

    data class SearchPipelineForceControlRequest(
        val forceControl: Boolean? = null,
    )

    data class SearchEngineMirrorForceDisableRequest(
        val forceDisabled: Boolean = false,
    )

    data class SearchRuntimeFlags(
        val searchPipelineForceControlEnabled: Boolean,
        val searchPipelineRuntimeOverride: Boolean,
        val searchEngineMirrorForceDisabled: Boolean,
        val searchEngineMirrorCircuitOpen: Boolean,
        val searchEngineMirrorCircuitRemainingSeconds: Long,
        val searchEngineMirrorConsecutiveFailures: Int,
        val searchEngineMirrorFailureThreshold: Int,
    )

    @GetMapping("/bootstrap")
    @Transactional(readOnly = true)
    fun bootstrap(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): AdminSystemBootstrapResBody =
        AdminSystemBootstrapResBody(
            member = AuthSessionMemberDto(securityUser),
            health = adminSystemHealthSnapshotService.getHealthSummary(),
            dashboard = adminDashboardSnapshotService.getSnapshot(),
        )

    /**
     * health 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    @GetMapping("/health")
    @Transactional(readOnly = true)
    fun health(
        @RequestParam(defaultValue = "false") fresh: Boolean,
    ): HealthResBody =
        if (fresh) {
            adminSystemHealthSnapshotService.getFreshHealthSummary()
        } else {
            adminSystemHealthSnapshotService.getHealthSummary()
        }

    @GetMapping("/mail/signup")
    @Transactional(readOnly = true)
    fun signupMailDiagnostics(
        @RequestParam(defaultValue = "false") checkConnection: Boolean,
    ): SignupMailDiagnostics = signupMailDiagnosticsService.diagnose(checkConnection = checkConnection)

    @GetMapping("/grafana/auth-proxy")
    @Transactional(readOnly = true)
    fun grafanaAuthProxy(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): ResponseEntity<Void> =
        ResponseEntity
            .noContent()
            .header("X-WEBAUTH-USER", securityUser.username)
            .header("X-WEBAUTH-NAME", securityUser.nickname)
            .header(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0")
            .header(HttpHeaders.PRAGMA, "no-cache")
            .build()

    @GetMapping("/tasks")
    @Transactional(readOnly = true)
    fun taskQueueDiagnostics(): TaskQueueDiagnostics = taskQueueDiagnosticsService.diagnoseQueue()

    @GetMapping("/dashboard-snapshot")
    @Transactional(readOnly = true)
    fun dashboardSnapshot(): AdminDashboardSnapshot = adminDashboardSnapshotService.getSnapshot()

    @GetMapping("/auth/security-events")
    @Transactional(readOnly = true)
    fun authSecurityEvents(
        @RequestParam(defaultValue = "30") limit: Int,
    ): List<AuthSecurityEventDto> = authSecurityEventService.getRecent(limit)

    @GetMapping("/notifications/stream")
    @Transactional(readOnly = true)
    fun notificationStreamDiagnostics(): MemberNotificationSseService.StreamDiagnostics = memberNotificationSseService.diagnostics()

    @PostMapping("/tasks/replay-failed")
    @Transactional
    fun replayFailedTasks(
        @RequestBody reqBody: TaskDlqReplayRequest,
    ): RsData<TaskDlqReplayResult> {
        val result =
            taskDlqReplayService.replayFailedTasks(
                taskType = reqBody.taskType,
                limit = reqBody.limit,
                resetRetryCount = reqBody.resetRetryCount,
            )

        return RsData(
            "200-10",
            "DLQ 재실행 요청을 처리했습니다.",
            result,
        )
    }

    @GetMapping("/search/runtime-flags")
    @Transactional(readOnly = true)
    fun getSearchRuntimeFlags(): SearchRuntimeFlags {
        val mirrorCircuitStatus = postSearchEngineMirrorService.getCircuitStatus()
        return SearchRuntimeFlags(
            searchPipelineForceControlEnabled = postKeywordSearchPipelineService.isForceControlEnabled(),
            searchPipelineRuntimeOverride = postKeywordSearchPipelineService.isForceControlRuntimeOverridden(),
            searchEngineMirrorForceDisabled = postSearchEngineMirrorService.isRuntimeForceDisabled(),
            searchEngineMirrorCircuitOpen = mirrorCircuitStatus.open,
            searchEngineMirrorCircuitRemainingSeconds = mirrorCircuitStatus.remainingSeconds,
            searchEngineMirrorConsecutiveFailures = mirrorCircuitStatus.consecutiveFailures,
            searchEngineMirrorFailureThreshold = mirrorCircuitStatus.failureThreshold,
        )
    }

    @PostMapping("/search/pipeline/force-control")
    @Transactional
    fun setSearchPipelineForceControl(
        @RequestBody reqBody: SearchPipelineForceControlRequest,
    ): RsData<SearchRuntimeFlags> {
        postKeywordSearchPipelineService.setForceControlRuntime(reqBody.forceControl)
        return RsData(
            "200-11",
            "검색 파이프라인 force-control 플래그를 갱신했습니다.",
            getSearchRuntimeFlags(),
        )
    }

    @PostMapping("/search-engine/mirror/force-disable")
    @Transactional
    fun setSearchEngineMirrorForceDisable(
        @RequestBody reqBody: SearchEngineMirrorForceDisableRequest,
    ): RsData<SearchRuntimeFlags> {
        postSearchEngineMirrorService.setRuntimeForceDisabled(reqBody.forceDisabled)
        return RsData(
            "200-12",
            "검색엔진 미러 force-disable 플래그를 갱신했습니다.",
            getSearchRuntimeFlags(),
        )
    }

    @GetMapping("/storage/cleanup")
    @Transactional(readOnly = true)
    fun uploadedFileCleanupDiagnostics(): UploadedFileCleanupDiagnostics = uploadedFileRetentionService.diagnoseCleanup()

    @PostMapping("/mail/signup/test")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Transactional
    fun sendSignupTestMail(
        @RequestBody @Valid reqBody: SignupMailTestRequest,
    ): RsData<Map<String, String>> {
        signupMailDiagnosticsService.sendTestMail(reqBody.email)

        return RsData(
            "202-3",
            "회원가입 테스트 메일을 전송했습니다.",
            mapOf("email" to reqBody.email.trim()),
        )
    }
}
