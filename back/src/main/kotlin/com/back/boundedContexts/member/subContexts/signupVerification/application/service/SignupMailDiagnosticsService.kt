package com.back.boundedContexts.member.subContexts.signupVerification.application.service

import com.back.boundedContexts.member.subContexts.signupVerification.application.port.output.SignupVerificationMailSenderPort
import com.back.boundedContexts.member.subContexts.signupVerification.dto.SendSignupVerificationMailPayload
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.task.application.TaskProcessingLockDiagnostics
import com.back.global.task.application.TaskProcessingLockDiagnosticsService
import com.back.global.task.application.TaskQueueDiagnosticsService
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.JavaMailSenderImpl
import org.springframework.stereotype.Service
import java.time.Instant

/**
 * `SignupMailDiagnostics` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class SignupMailDiagnostics(
    val status: String,
    val adapter: String,
    val host: String?,
    val port: Int?,
    val mailFrom: String?,
    val usernameConfigured: Boolean,
    val passwordConfigured: Boolean,
    val smtpAuth: Boolean,
    val startTlsEnabled: Boolean,
    val missing: List<String>,
    val canConnect: Boolean?,
    val connectionError: String?,
    val checkedAt: Instant,
    val verifyPath: String,
    val taskQueue: com.back.global.task.application.TaskTypeDiagnostics,
    val queueRuntime: TaskProcessingLockDiagnostics,
)

/**
 * SignupMailDiagnosticsService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class SignupMailDiagnosticsService(
    private val signupVerificationMailSenderProvider: ObjectProvider<SignupVerificationMailSenderPort>,
    private val javaMailSenderProvider: ObjectProvider<JavaMailSender>,
    private val taskQueueDiagnosticsService: TaskQueueDiagnosticsService,
    private val taskProcessingLockDiagnosticsService: TaskProcessingLockDiagnosticsService,
    @Value("\${spring.mail.host:}")
    private val host: String,
    @Value("\${spring.mail.port:587}")
    private val port: Int,
    @Value("\${spring.mail.username:}")
    private val username: String,
    @Value("\${spring.mail.password:}")
    private val password: String,
    @Value("\${spring.mail.properties.mail.smtp.auth:true}")
    private val smtpAuth: Boolean,
    @Value("\${spring.mail.properties.mail.smtp.starttls.enable:true}")
    private val startTlsEnabled: Boolean,
    @Value("\${custom.member.signup.mailFrom:}")
    private val mailFrom: String,
    @Value("\${custom.member.signup.verifyPath:/signup/verify}")
    private val verifyPath: String,
) {
    private val signupMailTaskType =
        SendSignupVerificationMailPayload::class.java
            .getAnnotation(com.back.global.task.annotation.Task::class.java)
            .type

    /**
     * diagnose 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    fun diagnose(checkConnection: Boolean = false): SignupMailDiagnostics {
        val sender = signupVerificationMailSenderProvider.getIfAvailable()
        val adapter = sender?.javaClass?.simpleName ?: "UNAVAILABLE"
        val missing = buildMissingKeys()
        val checkedAt = Instant.now()
        val taskQueue = taskQueueDiagnosticsService.diagnoseTaskType(signupMailTaskType)
        val queueRuntime = taskProcessingLockDiagnosticsService.diagnose()

        if (queueRuntime.legacyOrphanLikely) {
            return SignupMailDiagnostics(
                status = "QUEUE_LOCKED",
                adapter = adapter,
                host = host.ifBlank { null },
                port = if (host.isBlank()) null else port,
                mailFrom = mailFrom.ifBlank { null },
                usernameConfigured = username.isNotBlank(),
                passwordConfigured = password.isNotBlank(),
                smtpAuth = smtpAuth,
                startTlsEnabled = startTlsEnabled,
                missing = missing,
                canConnect = null,
                connectionError = "Legacy processTasks lock is blocking ready tasks",
                checkedAt = checkedAt,
                verifyPath = normalizeVerifyPath(),
                taskQueue = taskQueue,
                queueRuntime = queueRuntime,
            )
        }

        if (adapter == "TestSignupVerificationMailSenderAdapter") {
            return SignupMailDiagnostics(
                status = "TEST_MODE",
                adapter = adapter,
                host = host.ifBlank { null },
                port = if (host.isBlank()) null else port,
                mailFrom = mailFrom.ifBlank { null },
                usernameConfigured = username.isNotBlank(),
                passwordConfigured = password.isNotBlank(),
                smtpAuth = smtpAuth,
                startTlsEnabled = startTlsEnabled,
                missing = missing,
                canConnect = null,
                connectionError = null,
                checkedAt = checkedAt,
                verifyPath = normalizeVerifyPath(),
                taskQueue = taskQueue,
                queueRuntime = queueRuntime,
            )
        }

        if (missing.isNotEmpty()) {
            return SignupMailDiagnostics(
                status = "MISCONFIGURED",
                adapter = adapter,
                host = host.ifBlank { null },
                port = if (host.isBlank()) null else port,
                mailFrom = mailFrom.ifBlank { null },
                usernameConfigured = username.isNotBlank(),
                passwordConfigured = password.isNotBlank(),
                smtpAuth = smtpAuth,
                startTlsEnabled = startTlsEnabled,
                missing = missing,
                canConnect = false,
                connectionError = "Missing required SMTP configuration",
                checkedAt = checkedAt,
                verifyPath = normalizeVerifyPath(),
                taskQueue = taskQueue,
                queueRuntime = queueRuntime,
            )
        }

        val connectionTestResult =
            if (checkConnection) {
                testConnection()
            } else {
                ConnectionTestResult(null, null)
            }

        val status =
            when {
                sender == null -> "UNAVAILABLE"
                connectionTestResult.canConnect == false -> "CONNECTION_FAILED"
                else -> "READY"
            }

        return SignupMailDiagnostics(
            status = status,
            adapter = adapter,
            host = host.ifBlank { null },
            port = port,
            mailFrom = mailFrom.ifBlank { null },
            usernameConfigured = username.isNotBlank(),
            passwordConfigured = password.isNotBlank(),
            smtpAuth = smtpAuth,
            startTlsEnabled = startTlsEnabled,
            missing = emptyList(),
            canConnect = connectionTestResult.canConnect,
            connectionError = connectionTestResult.errorMessage,
            checkedAt = checkedAt,
            verifyPath = normalizeVerifyPath(),
            taskQueue = taskQueue,
            queueRuntime = queueRuntime,
        )
    }

    /**
     * 이벤트/메시지를 전파하고 실패를 안전하게 처리합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    fun sendTestMail(email: String) {
        val diagnostics = diagnose(checkConnection = false)
        if (diagnostics.status !in listOf("READY", "TEST_MODE")) {
            throw AppException("503-2", "회원가입 메일 설정이 아직 준비되지 않았습니다.")
        }

        val verificationLink = "${AppConfig.siteFrontUrl}${normalizeVerifyPath()}?token=test-signup-mail"

        signupVerificationMailSenderProvider
            .getIfAvailable()
            ?.send(
                toEmail = email.trim(),
                verificationLink = verificationLink,
                expiresAt = Instant.now().plusSeconds(3600),
            ) ?: throw AppException("503-2", "회원가입 메일 발송 어댑터를 찾지 못했습니다.")
    }

    /**
     * buildMissingKeys 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun buildMissingKeys(): List<String> {
        val missing = mutableListOf<String>()

        if (host.isBlank()) missing += "SPRING__MAIL__HOST"
        if (username.isBlank()) missing += "SPRING__MAIL__USERNAME"
        if (password.isBlank()) missing += "SPRING__MAIL__PASSWORD"
        if (mailFrom.isBlank()) missing += "CUSTOM__MEMBER__SIGNUP__MAIL_FROM"

        return missing
    }

    private fun normalizeVerifyPath(): String =
        verifyPath
            .trim()
            .ifBlank { "/signup/verify" }
            .let { path ->
                if (path.startsWith("/")) {
                    path
                } else {
                    "/$path"
                }
            }

    /**
     * testConnection 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun testConnection(): ConnectionTestResult {
        val javaMailSender = javaMailSenderProvider.getIfAvailable()

        return try {
            when (javaMailSender) {
                is JavaMailSenderImpl -> {
                    javaMailSender.testConnection()
                    ConnectionTestResult(true, null)
                }

                null -> ConnectionTestResult(false, "JavaMailSender is unavailable")
                else -> ConnectionTestResult(true, null)
            }
        } catch (exception: Exception) {
            ConnectionTestResult(false, exception.rootCauseMessage())
        }
    }

    private fun Exception.rootCauseMessage(): String {
        val rootCause = generateSequence(this as Throwable?) { it.cause }.lastOrNull() ?: this
        return rootCause.message ?: rootCause::class.simpleName ?: "Unknown SMTP error"
    }

    private data class ConnectionTestResult(
        val canConnect: Boolean?,
        val errorMessage: String?,
    )
}
