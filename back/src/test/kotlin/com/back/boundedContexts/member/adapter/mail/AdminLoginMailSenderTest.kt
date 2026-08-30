package com.back.boundedContexts.member.adapter.mail

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.doAnswer
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.springframework.beans.factory.ObjectProvider
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.JavaMailSenderImpl
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
    fun `connection failure is translated to dependency not ready`() {
        val failure = IllegalStateException("smtp unavailable")
        val javaMailSender = mock(JavaMailSenderImpl::class.java)
        doThrow(failure).`when`(javaMailSender).testConnection()
        val sender = AdminLoginMailSender(objectProvider(javaMailSender), FROM_ADDRESS)

        assertThatThrownBy { sender.verifyConnection() }
            .isInstanceOfSatisfying(AppException::class.java) { exception ->
                assertThat(exception.errorCode).isEqualTo(ErrorCode.DEPENDENCY_NOT_READY)
                assertThat(exception.cause).isSameAs(failure)
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

    private companion object {
        private const val FROM_ADDRESS = "mailer@example.com"
        private const val ADMIN_EMAIL = "admin@example.com"
    }
}
