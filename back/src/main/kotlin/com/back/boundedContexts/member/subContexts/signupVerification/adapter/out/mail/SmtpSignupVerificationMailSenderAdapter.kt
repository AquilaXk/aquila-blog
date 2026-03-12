package com.back.boundedContexts.member.subContexts.signupVerification.adapter.out.mail

import com.back.boundedContexts.member.subContexts.signupVerification.application.port.out.SignupVerificationMailSenderPort
import com.back.global.exception.app.AppException
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Profile
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.MimeMessageHelper
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

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
        expiresAt: Instant,
    ) {
        if (mailFrom.isBlank()) {
            throw AppException("503-1", "회원가입 메일 발송 설정이 아직 완료되지 않았습니다.")
        }

        val expiresAtText = expiresAt.atZone(SEOUL_ZONE_ID).format(EXPIRES_AT_FORMATTER)
        val message = javaMailSender.createMimeMessage()
        val helper = MimeMessageHelper(message, true, "UTF-8")
        val resolvedMailSubject = resolveMailSubject()

        helper.setFrom(mailFrom)
        helper.setTo(toEmail)
        message.setSubject(resolvedMailSubject, StandardCharsets.UTF_8.name())
        message.setHeader("Content-Language", "ko")
        helper.setText(
            buildPlainTextBody(verificationLink = verificationLink, expiresAtText = expiresAtText),
            buildHtmlBody(verificationLink = verificationLink, expiresAtText = expiresAtText),
        )

        javaMailSender.send(message)
    }

    private fun buildPlainTextBody(
        verificationLink: String,
        expiresAtText: String,
    ): String =
        """
        안녕하세요.

        Aquila Blog 회원가입을 시작해주셔서 감사합니다.
        
        아래 버튼을 누르면 이메일 인증이 완료되고 가입 절차를 계속 진행할 수 있습니다.
        $verificationLink
        
        본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.

        이 링크는 $expiresAtText 까지 유효합니다.
        """.trimIndent()

    private fun buildHtmlBody(
        verificationLink: String,
        expiresAtText: String,
    ): String =
        """
        <!doctype html>
        <html lang="ko">
          <head>
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>${escapeHtml(resolveMailSubject())}</title>
          </head>
          <body style="margin:0; padding:0; background-color:#f4f7fb; color:#111827; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
            <span style="display:none; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden;">
              Aquila Blog 회원가입을 이어서 진행하려면 인증 링크를 클릭해주세요.
            </span>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f7fb; margin:0; padding:32px 0;">
              <tr>
                <td align="center" style="padding:0 16px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px; margin:0 auto;">
                    <tr>
                      <td align="center" style="padding:0 0 20px;">
                        <div style="display:inline-block; padding:10px 18px; border-radius:999px; background:#e8f0ff; color:#1d4ed8; font-size:13px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;">
                          Aquila Blog
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#ffffff; border:1px solid #dbe5f2; border-radius:28px; padding:40px 32px; box-shadow:0 18px 48px rgba(15, 23, 42, 0.08);">
                        <div style="font-size:34px; line-height:1.1; font-weight:800; letter-spacing:-0.03em; color:#0f172a; text-align:center;">
                          회원가입을 이어서 진행해주세요
                        </div>
                        <div style="margin:18px auto 0; max-width:520px; padding:18px 20px; border-radius:18px; background:#f8fbff; border:1px solid #dbe5f2; color:#5b6472; font-size:18px; line-height:1.75; text-align:left;">
                          <p style="margin:0 0 18px; font-weight:700; color:#344054;">안녕하세요.</p>
                          <p style="margin:0 0 18px;">Aquila Blog 회원가입을 시작해주셔서 감사합니다.</p>
                          <p style="margin:0 0 18px;">아래 버튼을 누르면 이메일 인증이 완료되고 가입 절차를 계속 진행할 수 있습니다.</p>
                          <p style="margin:0;">본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.</p>
                        </div>
                        <div style="padding:28px 0 18px; text-align:center;">
                          <a href="${escapeHtmlAttribute(
            verificationLink,
        )}" style="display:inline-block; min-width:240px; padding:18px 32px; border-radius:18px; background:linear-gradient(135deg, #2563eb, #3b82f6); color:#ffffff; font-size:26px; font-weight:800; text-decoration:none; box-shadow:0 14px 28px rgba(37, 99, 235, 0.28);">
                            계속하기
                          </a>
                        </div>
                        <div style="color:#667085; font-size:15px; line-height:1.7; text-align:center;">
                          버튼이 동작하지 않으면 아래 링크를 브라우저에 붙여넣어 열어주세요.
                        </div>
                        <div style="padding-top:12px; text-align:center; word-break:break-all;">
                          <a href="${escapeHtmlAttribute(
            verificationLink,
        )}" style="color:#2563eb; font-size:15px; line-height:1.8; text-decoration:underline;">
                            ${escapeHtml(verificationLink)}
                          </a>
                        </div>
                        <div style="margin-top:28px; padding-top:22px; border-top:1px solid #e5e7eb; color:#6b7280; font-size:14px; line-height:1.8; text-align:center;">
                          이 링크는 <strong style="color:#374151;">${escapeHtml(expiresAtText)}</strong> 까지 유효합니다.
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
        """.trimIndent()

    private fun resolveMailSubject(): String {
        val trimmedSubject = mailSubject.trim()
        if (trimmedSubject.isBlank()) {
            return DEFAULT_MAIL_SUBJECT
        }

        return if (trimmedSubject.contains(REPLACEMENT_CHARACTER)) DEFAULT_MAIL_SUBJECT else trimmedSubject
    }

    private fun escapeHtml(value: String): String =
        value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")

    private fun escapeHtmlAttribute(value: String): String = escapeHtml(value)

    companion object {
        private const val DEFAULT_MAIL_SUBJECT = "Aquila Blog 회원가입"
        private const val REPLACEMENT_CHARACTER = '\uFFFD'
        private val SEOUL_ZONE_ID: ZoneId = ZoneId.of("Asia/Seoul")
        private val EXPIRES_AT_FORMATTER: DateTimeFormatter =
            DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm 'KST'")
    }
}
