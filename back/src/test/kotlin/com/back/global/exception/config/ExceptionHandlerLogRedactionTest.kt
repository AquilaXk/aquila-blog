package com.back.global.exception.config

import com.back.global.exception.application.AppException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException

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
        val appender = ExceptionHandlerListAppenderSupport.attach()

        try {
            handler.handleAppException(AppException("500-9", "failed token=LEAK_TEST_123"), request)
        } finally {
            ExceptionHandlerListAppenderSupport.detach(appender)
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
        val appender = ExceptionHandlerListAppenderSupport.attach()

        val response =
            try {
                handler.handleUnexpectedException(
                    RuntimeException("failed url=/login/oauth2/code/kakao?code=LEAK_TEST_123&state=STATE_123"),
                    request,
                )
            } finally {
                ExceptionHandlerListAppenderSupport.detach(appender)
            }

        assertThat(response.statusCode).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR)
        assertThat(appender.list.single().formattedMessage)
            .contains("query=code=[REDACTED]&state=[REDACTED]&page=1")
            .contains("?code=[REDACTED]&state=[REDACTED]")
            .contains("exceptionStack=java.lang.RuntimeException")
            .doesNotContain("LEAK_TEST_123")
            .doesNotContain("STATE_123")
    }

    @Test
    @DisplayName("mvc_request_rejected warn 로그는 스택 트레이스를 남기지 않는다")
    fun `mvc request rejected warn log does not include stack trace`() {
        val handler = ExceptionHandler()
        val request = MockHttpServletRequest("GET", "/posts/not-a-number")
        val appender = ExceptionHandlerListAppenderSupport.attach()

        val method =
            MvcExceptionFixtureController::class.java.getDeclaredMethod(
                "typeMismatch",
                Long::class.javaPrimitiveType,
            )
        val parameter = MethodParameter(method, 0)
        val response =
            try {
                handler.handleMethodArgumentTypeMismatchException(
                    MethodArgumentTypeMismatchException(
                        "not-a-number",
                        Long::class.java,
                        "id",
                        parameter,
                        IllegalArgumentException("failed token=LEAK_TEST_123"),
                    ),
                    request,
                )
            } finally {
                ExceptionHandlerListAppenderSupport.detach(appender)
            }

        assertThat(response.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
        val event = appender.list.single()
        assertThat(event.formattedMessage)
            .contains("mvc_request_rejected")
            .contains("method=GET")
            .contains("path=/posts/not-a-number")
            .contains("exceptionClass=org.springframework.web.method.annotation.MethodArgumentTypeMismatchException")
            .contains("reason=type_mismatch name=id requiredType=long")
            .doesNotContain("exceptionStack=")
            .doesNotContain("\tat ")
            .doesNotContain("LEAK_TEST_123")
            .doesNotContain("For input string")
        assertThat(event.throwableProxy).isNull()
    }
}
