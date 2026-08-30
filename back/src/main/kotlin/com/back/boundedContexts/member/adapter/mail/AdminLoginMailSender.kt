package com.back.boundedContexts.member.adapter.mail

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.JavaMailSenderImpl
import org.springframework.stereotype.Component

@Component
class AdminLoginMailSender(
    private val mailSenderProvider: ObjectProvider<JavaMailSender>,
    @param:Value("\${spring.mail.username:}")
    private val fromAddress: String,
) {
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
        mailSender.send(message)
    }

    fun verifyConnection() {
        val mailSender = configuredMailSender()
        val javaMailSender =
            mailSender as? JavaMailSenderImpl
                ?: throw dependencyUnavailable()
        try {
            javaMailSender.testConnection()
        } catch (exception: Exception) {
            throw AppException(ErrorCode.DEPENDENCY_NOT_READY, "이메일 인증을 사용할 수 없습니다.", exception)
        }
    }

    private fun configuredMailSender(): JavaMailSender {
        val mailSender = mailSenderProvider.getIfAvailable() ?: throw dependencyUnavailable()
        if (fromAddress.isBlank()) throw dependencyUnavailable()
        return mailSender
    }

    private fun dependencyUnavailable() = AppException(ErrorCode.DEPENDENCY_NOT_READY, "이메일 인증을 사용할 수 없습니다.")
}
