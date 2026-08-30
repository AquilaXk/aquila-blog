package com.back.boundedContexts.member.adapter.mail

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import jakarta.mail.AuthenticationFailedException
import jakarta.mail.MessagingException
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.JavaMailSenderImpl
import org.springframework.stereotype.Component
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.ExecutionException
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import javax.net.ssl.SSLException

@Component
class AdminLoginMailSender(
    private val mailSenderProvider: ObjectProvider<JavaMailSender>,
    @param:Value("\${spring.mail.username:}")
    private val fromAddress: String,
    @param:Value("\${custom.auth.adminEmail.requestDeadlineMillis:10000}")
    private val requestDeadlineMillis: Long = 10_000,
) {
    init {
        require(requestDeadlineMillis in 1_000..10_000) {
            "custom.auth.adminEmail.requestDeadlineMillis must be between 1000 and 10000."
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
                ?: throw dependencyUnavailable(MailFailureCategory.CONFIGURATION)
        runWithinRequestDeadline { javaMailSender.testConnection() }
    }

    private fun runWithinRequestDeadline(action: () -> Unit) {
        val task = FutureTask(action)
        Thread.ofVirtual().name("admin-email-mail").start(task)
        try {
            task.get(requestDeadlineMillis, TimeUnit.MILLISECONDS)
        } catch (exception: TimeoutException) {
            task.cancel(true)
            throw dependencyUnavailable(MailFailureCategory.TIMEOUT)
        } catch (exception: InterruptedException) {
            task.cancel(true)
            Thread.currentThread().interrupt()
            throw dependencyUnavailable(MailFailureCategory.INTERRUPTED)
        } catch (exception: ExecutionException) {
            throw dependencyUnavailable(classifyFailure(exception.cause))
        }
    }

    private fun configuredMailSender(): JavaMailSender {
        val mailSender = mailSenderProvider.getIfAvailable() ?: throw dependencyUnavailable(MailFailureCategory.CONFIGURATION)
        if (fromAddress.isBlank()) throw dependencyUnavailable(MailFailureCategory.CONFIGURATION)
        return mailSender
    }

    private fun classifyFailure(initial: Throwable?): MailFailureCategory {
        var current = initial
        repeat(MAX_FAILURE_CAUSE_DEPTH) {
            val failure = current ?: return MailFailureCategory.TRANSPORT
            when (failure) {
                is AuthenticationFailedException -> return MailFailureCategory.AUTHENTICATION
                is TimeoutException, is SocketTimeoutException -> return MailFailureCategory.TIMEOUT
                is InterruptedException -> return MailFailureCategory.INTERRUPTED
                is SSLException -> return MailFailureCategory.TLS
                is UnknownHostException -> return MailFailureCategory.DNS
                is ConnectException -> return MailFailureCategory.CONNECTION
            }
            current =
                if (failure is MessagingException) {
                    failure.nextException ?: failure.cause
                } else {
                    failure.cause
                }
        }
        return MailFailureCategory.TRANSPORT
    }

    private fun dependencyUnavailable(category: MailFailureCategory) =
        AppException(
            ErrorCode.DEPENDENCY_NOT_READY,
            "이메일 인증을 사용할 수 없습니다.",
            IllegalStateException("admin_email_mail_failure category=${category.logValue}"),
        )

    private enum class MailFailureCategory(
        val logValue: String,
    ) {
        TIMEOUT("timeout"),
        INTERRUPTED("interrupted"),
        AUTHENTICATION("authentication"),
        TLS("tls"),
        DNS("dns"),
        CONNECTION("connection"),
        CONFIGURATION("configuration"),
        TRANSPORT("transport"),
    }

    private companion object {
        private const val MAX_FAILURE_CAUSE_DEPTH = 8
    }
}
