package com.back.boundedContexts.member.subContexts.signupVerification.adapter.out.mail

import com.back.boundedContexts.member.subContexts.signupVerification.application.port.out.SignupVerificationMailSenderPort
import com.back.global.exception.app.AppException
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Profile
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.stereotype.Component

@Profile("!test")
@Component
class SmtpSignupVerificationMailSenderAdapter(
    private val javaMailSender: JavaMailSender,
    @Value("\${custom.member.signup.mailFrom:}")
    private val mailFrom: String,
    @Value("\${custom.member.signup.mailSubject:[AquilaXk] 회원가입 이메일 인증}")
    private val mailSubject: String,
) : SignupVerificationMailSenderPort {
    override fun send(
        toEmail: String,
        verificationLink: String,
        expiresAt: java.time.Instant,
    ) {
        if (mailFrom.isBlank()) {
            throw AppException("503-1", "회원가입 메일 발송 설정이 아직 완료되지 않았습니다.")
        }

        val message =
            SimpleMailMessage().apply {
                setFrom(mailFrom)
                setTo(toEmail)
                subject = mailSubject
                text =
                    """
                    안녕하세요.
                    
                    아래 링크를 눌러 회원가입을 이어서 진행해주세요.
                    $verificationLink
                    
                    이 링크는 $expiresAt 까지 유효합니다.
                    본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.
                    """.trimIndent()
            }

        javaMailSender.send(message)
    }
}
