package com.back.boundedContexts.member.adapter.mail

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.JavaMailSenderImpl
import org.springframework.stereotype.Component
import java.util.concurrent.ExecutionException
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

@Component
class AdminLoginMailSender(
    private val mailSenderProvider: ObjectProvider<JavaMailSender>,
    @param:Value("\${spring.mail.username:}")
    private val fromAddress: String,
    @param:Value("\${custom.auth.adminEmail.requestDeadlineMillis:5000}")
    private val requestDeadlineMillis: Long = 5_000,
) {
    init {
        require(requestDeadlineMillis in 1_000..8_000) {
            "custom.auth.adminEmail.requestDeadlineMillis must be between 1000 and 8000."
        }
    }

    fun sendCode(
        email: String,
        code: String,
        expiresInSeconds: Long,
    ) {
        val mailSender = configuredMailSender()

        val message =
            SimpleMailMessage().apply {
                from = fromAddress
                setTo(email)
                subject = "Aquila Blog administrator sign-in code"
                text =
                    """
                    관리자 로그인 인증 코드는 $code 입니다.

                    ${expiresInSeconds / 60}분 안에 요청한 브라우저에서 입력해주세요.
                    요청하지 않았다면 이 메일을 무시해주세요.
                    """.trimIndent()
            }
        runWithinRequestDeadline { mailSender.send(message) }
    }

    fun verifyConnection() {
        val mailSender = configuredMailSender()
        val javaMailSender =
            mailSender as? JavaMailSenderImpl
                ?: throw dependencyUnavailable()
        try {
            runWithinRequestDeadline { javaMailSender.testConnection() }
        } catch (exception: Exception) {
            throw AppException(ErrorCode.DEPENDENCY_NOT_READY, "이메일 인증을 사용할 수 없습니다.", exception)
        }
    }

    private fun runWithinRequestDeadline(action: () -> Unit) {
        val task = FutureTask(action)
        Thread.ofVirtual().name("admin-email-mail").start(task)
        try {
            task.get(requestDeadlineMillis, TimeUnit.MILLISECONDS)
        } catch (exception: TimeoutException) {
            task.cancel(true)
            throw dependencyUnavailable(exception)
        } catch (exception: InterruptedException) {
            task.cancel(true)
            Thread.currentThread().interrupt()
            throw dependencyUnavailable(exception)
        } catch (exception: ExecutionException) {
            val cause = exception.cause
            if (cause is RuntimeException) throw cause
            throw dependencyUnavailable(exception)
        }
    }

    private fun configuredMailSender(): JavaMailSender {
        val mailSender = mailSenderProvider.getIfAvailable() ?: throw dependencyUnavailable()
        if (fromAddress.isBlank()) throw dependencyUnavailable()
        return mailSender
    }

    private fun dependencyUnavailable(cause: Exception? = null) = AppException(ErrorCode.DEPENDENCY_NOT_READY, "이메일 인증을 사용할 수 없습니다.", cause)
}
