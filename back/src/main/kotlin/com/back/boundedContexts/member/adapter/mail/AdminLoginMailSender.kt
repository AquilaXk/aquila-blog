package com.back.boundedContexts.member.adapter.mail

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import jakarta.mail.AuthenticationFailedException
import jakarta.mail.MessagingException
import jakarta.mail.internet.MimeBodyPart
import jakarta.mail.internet.MimeMultipart
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.mail.MailSendException
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.JavaMailSenderImpl
import org.springframework.mail.javamail.MimeMessageHelper
import org.springframework.stereotype.Component
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.nio.charset.StandardCharsets
import java.util.ArrayDeque
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
    private val logger = LoggerFactory.getLogger(AdminLoginMailSender::class.java)

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
        val expiresInMinutes = expiresInSeconds / 60
        val plainText =
            """
            관리자 로그인 인증 코드는 $code 입니다.

            ${expiresInMinutes}분 안에 요청한 브라우저에서 입력해주세요.
            요청하지 않았다면 이 메일을 무시해주세요.
            """.trimIndent()
        val html =
            """
            <!doctype html>
            <html lang="ko">
              <body style="margin:0;background:#f7f7f5;color:#0f1724;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f7f7f5;">
                  <tr><td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #dfe1e5;border-radius:12px;overflow:hidden;">
                      <tr><td style="padding:28px 32px 16px;font-size:20px;font-weight:700;color:#0f1724;">AquilaLog</td></tr>
                      <tr><td style="padding:0 32px 28px;">
                        <p style="margin:0 0 12px;font-size:18px;font-weight:700;line-height:1.4;">관리자 로그인 인증 코드</p>
                        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#36414f;">요청한 브라우저에서 아래 코드를 입력해주세요.</p>
                        <div style="margin:0 0 24px;padding:18px;text-align:center;background:#edf4ff;border-radius:8px;font-size:28px;font-weight:700;letter-spacing:0.16em;color:#155eef;">$code</div>
                        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#36414f;">이 코드는 ${expiresInMinutes}분 동안 사용할 수 있습니다.</p>
                        <p style="margin:0;font-size:14px;line-height:1.6;color:#36414f;">요청하지 않았다면 이 메일을 무시해주세요.</p>
                      </td></tr>
                    </table>
                  </td></tr>
                </table>
              </body>
            </html>
            """.trimIndent()
        runWithinRequestDeadline {
            val message = mailSender.createMimeMessage()
            MimeMessageHelper(message, StandardCharsets.UTF_8.name()).apply {
                setFrom(fromAddress)
                setTo(email)
                setSubject("[AquilaLog] 관리자 로그인 인증 코드")
            }
            val alternative = MimeMultipart("alternative")
            alternative.addBodyPart(
                MimeBodyPart().apply {
                    setText(plainText, StandardCharsets.UTF_8.name())
                },
            )
            alternative.addBodyPart(
                MimeBodyPart().apply {
                    setContent(html, "text/html; charset=${StandardCharsets.UTF_8.name()}")
                },
            )
            message.setContent(alternative)
            mailSender.send(message)
        }
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
        val pending = ArrayDeque<Throwable>()
        initial?.let(pending::addLast)
        val visited = mutableSetOf<Throwable>()
        while (pending.isNotEmpty() && visited.size < MAX_FAILURE_NODE_COUNT) {
            val failure = pending.removeFirst()
            if (!visited.add(failure)) continue
            directCategory(failure)?.let { return it }

            if (failure is MailSendException) {
                failure.messageExceptions.forEach(pending::addLast)
            }
            if (failure is MessagingException) {
                failure.nextException?.let(pending::addLast)
            }
            failure.cause?.let(pending::addLast)
        }
        return MailFailureCategory.TRANSPORT
    }

    private fun directCategory(failure: Throwable): MailFailureCategory? =
        when (failure) {
            is AuthenticationFailedException -> MailFailureCategory.AUTHENTICATION
            is TimeoutException, is SocketTimeoutException -> MailFailureCategory.TIMEOUT
            is InterruptedException -> MailFailureCategory.INTERRUPTED
            is SSLException -> MailFailureCategory.TLS
            is UnknownHostException -> MailFailureCategory.DNS
            is ConnectException -> MailFailureCategory.CONNECTION
            else -> null
        }

    private fun dependencyUnavailable(category: MailFailureCategory): AppException {
        logger.warn("admin_email_mail_failure category={}", category.logValue)
        return AppException(
            ErrorCode.DEPENDENCY_NOT_READY,
            "이메일 인증을 사용할 수 없습니다.",
            IllegalStateException("admin_email_mail_failure category=${category.logValue}"),
        )
    }

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
        private const val MAX_FAILURE_NODE_COUNT = 16
    }
}
