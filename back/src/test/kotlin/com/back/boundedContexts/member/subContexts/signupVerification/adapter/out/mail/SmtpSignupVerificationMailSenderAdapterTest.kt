package com.back.boundedContexts.member.subContexts.signupVerification.adapter.out.mail

import jakarta.mail.BodyPart
import jakarta.mail.Multipart
import jakarta.mail.Session
import jakarta.mail.internet.MimeMessage
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.mail.MailException
import org.springframework.mail.MailParseException
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.MimeMessagePreparator
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.util.Properties

class SmtpSignupVerificationMailSenderAdapterTest {
    @Test
    fun `회원가입 메일을 utf-8 html 템플릿으로 보낸다`() {
        val mailSender = CapturingJavaMailSender()
        val adapter =
            SmtpSignupVerificationMailSenderAdapter(
                javaMailSender = mailSender,
                mailFrom = "verify@aquila.site",
                mailSubject = "Aquila 블로그 회원가입",
            )

        val verificationLink = "https://www.aquilaxk.site/signup/verify?token=test-token"
        adapter.send(
            toEmail = "tester@example.com",
            verificationLink = verificationLink,
            expiresAt = Instant.parse("2026-03-12T10:05:13Z"),
        )

        val sentMessage = requireNotNull(mailSender.sentMessage)
        val parts = extractTextParts(sentMessage.content)

        assertThat(sentMessage.subject).isEqualTo("Aquila 블로그 회원가입")
        assertThat(sentMessage.from.map { it.toString() }).contains("verify@aquila.site")
        assertThat(parts.html).contains("계속하기")
        assertThat(parts.html).contains("Aquila Blog")
        assertThat(parts.html).contains(verificationLink)
        assertThat(parts.plain).contains("회원가입을 계속하려면 아래 링크를 눌러주세요.")
        assertThat(parts.plain).contains(verificationLink)
        assertThat(parts.plain).contains("2026.03.12 19:05 KST")
    }

    private fun extractTextParts(content: Any?): ExtractedTextParts =
        when (content) {
            is String -> ExtractedTextParts(plain = content)
            is Multipart -> {
                val parts = ExtractedTextParts()
                for (index in 0 until content.count) {
                    val bodyPart = content.getBodyPart(index)
                    mergeExtractedText(parts, extractFromBodyPart(bodyPart))
                }
                parts
            }

            else -> ExtractedTextParts()
        }

    private fun extractFromBodyPart(bodyPart: BodyPart): ExtractedTextParts =
        when {
            bodyPart.isMimeType("text/plain") -> ExtractedTextParts(plain = bodyPart.content as String)
            bodyPart.isMimeType("text/html") -> ExtractedTextParts(html = bodyPart.content as String)
            bodyPart.content is Multipart -> extractTextParts(bodyPart.content)
            else -> ExtractedTextParts()
        }

    private fun mergeExtractedText(
        destination: ExtractedTextParts,
        source: ExtractedTextParts,
    ) {
        if (destination.plain == null && source.plain != null) {
            destination.plain = source.plain
        }
        if (destination.html == null && source.html != null) {
            destination.html = source.html
        }
    }

    private data class ExtractedTextParts(
        var plain: String? = null,
        var html: String? = null,
    )

    private class CapturingJavaMailSender : JavaMailSender {
        var sentMessage: MimeMessage? = null

        override fun createMimeMessage(): MimeMessage = MimeMessage(Session.getInstance(Properties()))

        override fun createMimeMessage(contentStream: java.io.InputStream): MimeMessage =
            try {
                MimeMessage(Session.getInstance(Properties()), contentStream)
            } catch (exception: Exception) {
                throw MailParseException("failed to parse mime message", exception)
            }

        override fun send(mimeMessage: MimeMessage) {
            mimeMessage.saveChanges()
            val outputStream = ByteArrayOutputStream()
            mimeMessage.writeTo(outputStream)
            sentMessage = createMimeMessage(ByteArrayInputStream(outputStream.toByteArray()))
        }

        override fun send(vararg mimeMessages: MimeMessage) {
            sentMessage = mimeMessages.lastOrNull()
            sentMessage?.saveChanges()
        }

        override fun send(mimeMessagePreparator: MimeMessagePreparator) {
            val message = createMimeMessage()
            try {
                mimeMessagePreparator.prepare(message)
                send(message)
            } catch (exception: Exception) {
                throw MailParseException("failed to prepare mime message", exception)
            }
        }

        override fun send(vararg mimeMessagePreparators: MimeMessagePreparator) {
            mimeMessagePreparators.forEach { send(it) }
        }

        override fun send(simpleMessage: SimpleMailMessage) {
            throw unsupported()
        }

        override fun send(vararg simpleMessages: SimpleMailMessage) {
            throw unsupported()
        }

        private fun unsupported(): MailException = MailParseException("simple mail message is not supported in this test")
    }
}
