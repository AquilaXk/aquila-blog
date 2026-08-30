package com.back.boundedContexts.member.adapter.mail

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import jakarta.mail.AuthenticationFailedException
import jakarta.mail.MessagingException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.doAnswer
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.ObjectProvider
import org.springframework.mail.MailSendException
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.JavaMailSenderImpl
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit
import java.util.stream.Stream

class AdminLoginMailSenderTest {
    @Test
    fun `send code uses the configured sender and bounded message`() {
        val javaMailSender = mock(JavaMailSender::class.java)
        var delivered: SimpleMailMessage? = null
        doAnswer { invocation ->
            delivered = invocation.getArgument(0)
            null
        }.`when`(javaMailSender).send(any(SimpleMailMessage::class.java))
        val sender = AdminLoginMailSender(objectProvider(javaMailSender), FROM_ADDRESS)

        sender.sendCode(ADMIN_EMAIL, "12345678", 600)

        assertThat(delivered).isNotNull
        assertThat(delivered!!.from).isEqualTo(FROM_ADDRESS)
        assertThat(delivered!!.to).containsExactly(ADMIN_EMAIL)
        assertThat(delivered!!.subject).isEqualTo("Aquila Blog administrator sign-in code")
        assertThat(delivered!!.text).contains("12345678", "10분 안에")
        verify(javaMailSender).send(any(SimpleMailMessage::class.java))
    }

    @Test
    fun `stalled delivery fails within the shared administrator deadline`() {
        val javaMailSender = mock(JavaMailSender::class.java)
        doAnswer {
            Thread.sleep(10_000)
            null
        }.`when`(javaMailSender).send(any(SimpleMailMessage::class.java))
        val sender =
            AdminLoginMailSender(
                mailSenderProvider = objectProvider(javaMailSender),
                fromAddress = FROM_ADDRESS,
                requestDeadlineMillis = 1_000,
            )
        val startedAt = System.nanoTime()

        assertThatThrownBy { sender.sendCode(ADMIN_EMAIL, "12345678", 600) }
            .isInstanceOfSatisfying(AppException::class.java) { exception ->
                assertThat(exception.errorCode).isEqualTo(ErrorCode.DEPENDENCY_NOT_READY)
                assertThat(exception.cause).isInstanceOf(IllegalStateException::class.java)
                assertThat(exception.cause!!.message).isEqualTo("admin_email_mail_failure category=timeout")
                assertThat(exception.cause!!.cause).isNull()
            }

        assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt)).isLessThan(2_000)
        verify(javaMailSender).send(any(SimpleMailMessage::class.java))
    }

    @Test
    fun `request deadline outside the edge-safe range is rejected`() {
        assertThatThrownBy {
            AdminLoginMailSender(
                mailSenderProvider = objectProvider(null),
                fromAddress = FROM_ADDRESS,
                requestDeadlineMillis = 999,
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("custom.auth.adminEmail.requestDeadlineMillis must be between 1000 and 10000.")
    }

    @Test
    fun `interrupted delivery preserves interruption and fails closed`() {
        val javaMailSender = mock(JavaMailSender::class.java)
        doAnswer {
            Thread.sleep(10_000)
            null
        }.`when`(javaMailSender).send(any(SimpleMailMessage::class.java))
        val sender = AdminLoginMailSender(objectProvider(javaMailSender), FROM_ADDRESS)
        Thread.currentThread().interrupt()
        try {
            assertDependencyUnavailable { sender.sendCode(ADMIN_EMAIL, "12345678", 600) }

            assertThat(Thread.currentThread().isInterrupted).isTrue()
        } finally {
            Thread.interrupted()
        }
    }

    @Test
    fun `missing sender fails closed`() {
        val sender = AdminLoginMailSender(objectProvider(null), FROM_ADDRESS)

        assertDependencyUnavailable { sender.sendCode(ADMIN_EMAIL, "12345678", 600) }
    }

    @Test
    fun `blank sender address fails closed before delivery`() {
        val javaMailSender = mock(JavaMailSender::class.java)
        val sender = AdminLoginMailSender(objectProvider(javaMailSender), " ")

        assertDependencyUnavailable { sender.sendCode(ADMIN_EMAIL, "12345678", 600) }

        verify(javaMailSender, never()).send(any(SimpleMailMessage::class.java))
    }

    @Test
    fun `connection readiness uses the configured Java mail transport`() {
        val javaMailSender = mock(JavaMailSenderImpl::class.java)
        val sender = AdminLoginMailSender(objectProvider(javaMailSender), FROM_ADDRESS)

        sender.verifyConnection()

        verify(javaMailSender).testConnection()
    }

    @Test
    fun `connection readiness rejects a sender without transport diagnostics`() {
        val javaMailSender = mock(JavaMailSender::class.java)
        val sender = AdminLoginMailSender(objectProvider(javaMailSender), FROM_ADDRESS)

        assertDependencyUnavailable { sender.verifyConnection() }
    }

    @Test
    fun `connection failure is translated without retaining provider detail`() {
        val failure = IllegalStateException("smtp unavailable")
        val javaMailSender = mock(JavaMailSenderImpl::class.java)
        doThrow(failure).`when`(javaMailSender).testConnection()
        val sender = AdminLoginMailSender(objectProvider(javaMailSender), FROM_ADDRESS)

        assertThatThrownBy { sender.verifyConnection() }
            .isInstanceOfSatisfying(AppException::class.java) { exception ->
                assertThat(exception.errorCode).isEqualTo(ErrorCode.DEPENDENCY_NOT_READY)
                assertThat(exception.cause).isInstanceOf(IllegalStateException::class.java)
                assertThat(exception.cause!!.message).isEqualTo("admin_email_mail_failure category=transport")
                assertThat(exception.cause!!.message).doesNotContain("smtp unavailable")
                assertThat(exception.cause!!.cause).isNull()
            }
    }

    @Test
    fun `checked connection failure is translated to dependency not ready`() {
        val javaMailSender = mock(JavaMailSenderImpl::class.java)
        doThrow(MessagingException("smtp unavailable")).`when`(javaMailSender).testConnection()
        val sender = AdminLoginMailSender(objectProvider(javaMailSender), FROM_ADDRESS)

        assertDependencyUnavailable { sender.verifyConnection() }
    }

    @Test
    fun `authentication failure exposes only the safe category`() {
        val javaMailSender = mock(JavaMailSenderImpl::class.java)
        doThrow(AuthenticationFailedException("credential and provider detail"))
            .`when`(javaMailSender)
            .testConnection()
        val sender = AdminLoginMailSender(objectProvider(javaMailSender), FROM_ADDRESS)
        val appender = attachListAppender()

        try {
            assertThatThrownBy { sender.verifyConnection() }
                .isInstanceOfSatisfying(AppException::class.java) { exception ->
                    assertThat(exception.errorCode).isEqualTo(ErrorCode.DEPENDENCY_NOT_READY)
                    assertThat(exception.cause).isInstanceOf(IllegalStateException::class.java)
                    assertThat(exception.cause!!.message).isEqualTo("admin_email_mail_failure category=authentication")
                    assertThat(exception.cause!!.message).doesNotContain("credential", "provider")
                    assertThat(exception.cause!!.cause).isNull()
                }

            assertThat(appender.list.map(ILoggingEvent::getFormattedMessage))
                .containsExactly("admin_email_mail_failure category=authentication")
                .allSatisfy { message -> assertThat(message).doesNotContain("credential", "provider") }
        } finally {
            detachListAppender(appender)
        }
    }

    @Test
    fun `per-message send failure exposes only the nested safe category`() {
        val javaMailSender = mock(JavaMailSender::class.java)
        val failure =
            MailSendException(
                mapOf<Any, Exception>(
                    SimpleMailMessage() to SocketTimeoutException("provider detail"),
                ),
            )
        doThrow(failure).`when`(javaMailSender).send(any(SimpleMailMessage::class.java))
        val sender = AdminLoginMailSender(objectProvider(javaMailSender), FROM_ADDRESS)

        assertThatThrownBy { sender.sendCode(ADMIN_EMAIL, "12345678", 600) }
            .isInstanceOfSatisfying(AppException::class.java) { exception ->
                assertThat(exception.errorCode).isEqualTo(ErrorCode.DEPENDENCY_NOT_READY)
                assertThat(exception.cause).isInstanceOf(IllegalStateException::class.java)
                assertThat(exception.cause!!.message).isEqualTo("admin_email_mail_failure category=timeout")
                assertThat(exception.cause!!.message).doesNotContain("provider")
                assertThat(exception.cause!!.cause).isNull()
            }
    }

    private fun assertDependencyUnavailable(action: () -> Unit) {
        assertThatThrownBy { action() }
            .isInstanceOfSatisfying(AppException::class.java) { exception ->
                assertThat(exception.errorCode).isEqualTo(ErrorCode.DEPENDENCY_NOT_READY)
            }
    }

    private fun <T : Any> objectProvider(value: T?): ObjectProvider<T> =
        object : ObjectProvider<T> {
            override fun getObject(vararg args: Any?): T = value ?: error("No value")

            override fun getIfAvailable(): T? = value

            override fun getIfUnique(): T? = value

            override fun iterator(): MutableIterator<T> = listOfNotNull(value).toMutableList().iterator()

            override fun stream(): Stream<T> = listOfNotNull(value).stream()

            override fun orderedStream(): Stream<T> = stream()
        }

    private fun attachListAppender(): ListAppender<ILoggingEvent> {
        val logger = LoggerFactory.getLogger(AdminLoginMailSender::class.java) as Logger
        return ListAppender<ILoggingEvent>().also {
            it.start()
            logger.addAppender(it)
        }
    }

    private fun detachListAppender(appender: ListAppender<ILoggingEvent>) {
        val logger = LoggerFactory.getLogger(AdminLoginMailSender::class.java) as Logger
        logger.detachAppender(appender)
        appender.stop()
    }

    private companion object {
        private const val FROM_ADDRESS = "mailer@example.com"
        private const val ADMIN_EMAIL = "admin@example.com"
    }
}
