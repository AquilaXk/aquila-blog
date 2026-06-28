package com.back.global.exception.config

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.back.global.exception.application.AppException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest

@DisplayName("ExceptionHandler 로그 redaction 테스트")
class ExceptionHandlerLogRedactionTest {
    @Test
    @DisplayName("5xx AppException 로그는 민감 query value를 남기지 않는다")
    fun `app exception log redacts sensitive query values`() {
        val handler = ExceptionHandler()
        val request =
            MockHttpServletRequest("GET", "/member/api/v1/signup/email/verify").apply {
                queryString = "token=LEAK_TEST_123&email=test@example.com"
            }
        val appender = attachListAppender()

        try {
            handler.handleAppException(AppException("500-9", "failed token=LEAK_TEST_123"), request)
        } finally {
            detachListAppender(appender)
        }

        val message = appender.list.single().formattedMessage
        assertThat(message)
            .contains("query=token=[REDACTED]&email=[REDACTED]")
            .contains("exceptionMessage=500-9 : failed token=[REDACTED]")
            .doesNotContain("LEAK_TEST_123")
            .doesNotContain("test@example.com")
    }

    @Test
    @DisplayName("unexpected exception message 안의 URL query도 마스킹한다")
    fun `unexpected exception log redacts query tokens inside exception message`() {
        val handler = ExceptionHandler()
        val request =
            MockHttpServletRequest("GET", "/login/oauth2/code/kakao").apply {
                queryString = "code=LEAK_TEST_123&state=STATE_123&page=1"
            }
        val appender = attachListAppender()

        val response =
            try {
                handler.handleUnexpectedException(
                    RuntimeException("failed url=/login/oauth2/code/kakao?code=LEAK_TEST_123&state=STATE_123"),
                    request,
                )
            } finally {
                detachListAppender(appender)
            }

        assertThat(response.statusCode).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR)
        assertThat(appender.list.single().formattedMessage)
            .contains("query=code=[REDACTED]&state=[REDACTED]&page=1")
            .contains("?code=[REDACTED]&state=[REDACTED]")
            .contains("exceptionStack=java.lang.RuntimeException")
            .doesNotContain("LEAK_TEST_123")
            .doesNotContain("STATE_123")
    }

    private fun attachListAppender(): ListAppender<ILoggingEvent> {
        val logger = LoggerFactory.getLogger(ExceptionHandler::class.java) as Logger
        return ListAppender<ILoggingEvent>().also {
            it.start()
            logger.addAppender(it)
        }
    }

    private fun detachListAppender(appender: ListAppender<ILoggingEvent>) {
        val logger = LoggerFactory.getLogger(ExceptionHandler::class.java) as Logger
        logger.detachAppender(appender)
    }
}
