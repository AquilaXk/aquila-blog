package com.back.global.system.`in`

import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupMailDiagnostics
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupMailDiagnosticsService
import com.back.global.rsData.RsData
import com.back.global.storage.app.UploadedFileCleanupDiagnostics
import com.back.global.storage.app.UploadedFileRetentionService
import com.back.global.task.app.TaskQueueDiagnostics
import com.back.global.task.app.TaskQueueDiagnosticsService
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.lang.management.ManagementFactory
import java.time.Instant

@RestController
@RequestMapping("/system/api/v1/adm")
class ApiV1AdmSystemController(
    private val jdbcTemplate: JdbcTemplate,
    private val stringRedisTemplateProvider: ObjectProvider<StringRedisTemplate>,
    private val signupMailDiagnosticsService: SignupMailDiagnosticsService,
    private val taskQueueDiagnosticsService: TaskQueueDiagnosticsService,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
) {
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

    @GetMapping("/health")
    @Transactional(readOnly = true)
    fun health(): HealthResBody {
        val db = checkDb()
        val redis = checkRedis()
        val signupMail = signupMailDiagnosticsService.diagnose(checkConnection = false).status
        val status = if (db == "UP") "UP" else "DOWN"

        return HealthResBody(
            status = status,
            serverTime = Instant.now().toString(),
            uptimeMs = ManagementFactory.getRuntimeMXBean().uptime,
            version = this::class.java.`package`?.implementationVersion ?: "dev",
            checks =
                HealthChecks(
                    db = db,
                    redis = redis,
                    signupMail = signupMail,
                ),
        )
    }

    @GetMapping("/mail/signup")
    @Transactional(readOnly = true)
    fun signupMailDiagnostics(
        @RequestParam(defaultValue = "false") checkConnection: Boolean,
    ): SignupMailDiagnostics = signupMailDiagnosticsService.diagnose(checkConnection = checkConnection)

    @GetMapping("/tasks")
    @Transactional(readOnly = true)
    fun taskQueueDiagnostics(): TaskQueueDiagnostics = taskQueueDiagnosticsService.diagnoseQueue()

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

    private fun checkDb(): String =
        try {
            val result = jdbcTemplate.queryForObject("SELECT 1", Int::class.java)
            if (result == 1) "UP" else "DOWN"
        } catch (_: Exception) {
            "DOWN"
        }

    private fun checkRedis(): String {
        val redisTemplate = stringRedisTemplateProvider.getIfAvailable() ?: return "SKIPPED"

        return try {
            val pong = redisTemplate.execute { connection -> connection.ping() }
            if (pong.equals("PONG", ignoreCase = true)) "UP" else "SKIPPED"
        } catch (_: Exception) {
            "SKIPPED"
        }
    }
}
