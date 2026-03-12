package com.back.boundedContexts.member.subContexts.signupVerification.application.service

import com.back.boundedContexts.member.subContexts.signupVerification.application.port.out.SignupVerificationMailSenderPort
import com.back.global.app.AppConfig
import com.back.global.exception.app.AppException
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.JavaMailSenderImpl
import org.springframework.stereotype.Service
import java.time.Instant

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
    val checkedAt: Instant,
    val verifyPath: String,
)

@Service
class SignupMailDiagnosticsService(
    private val signupVerificationMailSenderProvider: ObjectProvider<SignupVerificationMailSenderPort>,
    private val javaMailSenderProvider: ObjectProvider<JavaMailSender>,
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
    fun diagnose(checkConnection: Boolean = false): SignupMailDiagnostics {
        val sender = signupVerificationMailSenderProvider.getIfAvailable()
        val adapter = sender?.javaClass?.simpleName ?: "UNAVAILABLE"
        val missing = buildMissingKeys()
        val checkedAt = Instant.now()

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
                checkedAt = checkedAt,
                verifyPath = normalizeVerifyPath(),
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
                checkedAt = checkedAt,
                verifyPath = normalizeVerifyPath(),
            )
        }

        val canConnect =
            if (checkConnection) {
                testConnection()
            } else {
                null
            }

        val status =
            when {
                sender == null -> "UNAVAILABLE"
                canConnect == false -> "CONNECTION_FAILED"
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
            canConnect = canConnect,
            checkedAt = checkedAt,
            verifyPath = normalizeVerifyPath(),
        )
    }

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

    private fun testConnection(): Boolean {
        val javaMailSender = javaMailSenderProvider.getIfAvailable()

        return try {
            when (javaMailSender) {
                is JavaMailSenderImpl -> {
                    javaMailSender.testConnection()
                    true
                }

                null -> false
                else -> true
            }
        } catch (_: Exception) {
            false
        }
    }
}
