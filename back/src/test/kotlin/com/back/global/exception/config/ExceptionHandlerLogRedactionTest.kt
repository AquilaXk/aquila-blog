package com.back.global.exception.config

import ch.qos.logback.classic.Level
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.observability.ErrorMetrics
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import java.time.format.DateTimeParseException
import java.util.concurrent.CompletionException

@DisplayName("ExceptionHandler 로그 redaction 테스트")
class ExceptionHandlerLogRedactionTest {
    private fun newHandler(): ExceptionHandler = ExceptionHandler(ErrorMetrics(SimpleMeterRegistry()))

    @Test
    @DisplayName("5xx AppException 로그는 민감 query value를 남기지 않고 throwable로 스택을 전달한다")
    fun `app exception log redacts sensitive query values`() {
        val handler = newHandler()
        val request =
            MockHttpServletRequest("GET", "/member/api/v1/signup/email/verify").apply {
                queryString = "token=LEAK_TEST_123&email=test@example.com"
            }
        val appender = ExceptionHandlerListAppenderSupport.attach()

        try {
            handler.handleAppException(
                AppException(ErrorCode.INTERNAL_ERROR, "failed token=LEAK_TEST_123"),
                request,
            )
        } finally {
            ExceptionHandlerListAppenderSupport.detach(appender)
        }

        val event = appender.list.single()
        assertThat(event.level).isEqualTo(Level.ERROR)
        assertThat(event.formattedMessage)
            .contains("query=token=[REDACTED]&email=[REDACTED]")
            .contains("exceptionMessage=500-1 : failed token=[REDACTED]")
            .doesNotContain("exceptionStack=")
            .doesNotContain("LEAK_TEST_123")
            .doesNotContain("test@example.com")
        assertThat(event.throwableProxy).isNotNull
        assertThat(event.throwableProxy.className).isEqualTo(AppException::class.java.name)
        assertThat(event.throwableProxy.message)
            .contains("token=[REDACTED]")
            .doesNotContain("LEAK_TEST_123")
    }

    @Test
    @DisplayName("unexpected exception은 exceptionStack 문자열 없이 throwable로 스택을 전달하고 message를 마스킹한다")
    fun `unexpected exception log redacts query tokens inside exception message`() {
        val handler = newHandler()
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
        val event = appender.list.single()
        assertThat(event.level).isEqualTo(Level.ERROR)
        assertThat(event.formattedMessage)
            .contains("query=code=[REDACTED]&state=[REDACTED]&page=1")
            .contains("?code=[REDACTED]&state=[REDACTED]")
            .doesNotContain("exceptionStack=")
            .doesNotContain("LEAK_TEST_123")
            .doesNotContain("STATE_123")
        assertThat(event.throwableProxy).isNotNull
        assertThat(event.throwableProxy.className).isEqualTo(RuntimeException::class.java.name)
        assertThat(event.throwableProxy.message)
            .contains("code=[REDACTED]")
            .contains("state=[REDACTED]")
            .doesNotContain("LEAK_TEST_123")
            .doesNotContain("STATE_123")
    }

    @Test
    @DisplayName("순환 cause 그래프도 StackOverflow 없이 redaction 로그를 남긴다")
    fun `cyclic cause graph does not overflow while redacting`() {
        val handler = newHandler()
        val request = MockHttpServletRequest("GET", "/internal")
        val appender = ExceptionHandlerListAppenderSupport.attach()

        val a = RuntimeException("a token=LEAK_TEST_123")
        val b = RuntimeException("b token=LEAK_TEST_123")
        a.initCause(b)
        b.addSuppressed(a)

        try {
            handler.handleUnexpectedException(a, request)
        } finally {
            ExceptionHandlerListAppenderSupport.detach(appender)
        }

        val event = appender.list.single()
        assertThat(event.throwableProxy).isNotNull
        assertThat(event.throwableProxy.message)
            .contains("token=[REDACTED]")
            .doesNotContain("LEAK_TEST_123")
    }

    @Test
    @DisplayName("CompletionException처럼 cause가 생성자 고정인 예외도 루트 cause를 보존한다")
    fun `completion exception preserves redacted cause chain`() {
        val handler = newHandler()
        val request = MockHttpServletRequest("GET", "/internal")
        val appender = ExceptionHandlerListAppenderSupport.attach()

        val root = IllegalStateException("root token=LEAK_TEST_123")
        val unexpected = CompletionException("wrap token=LEAK_TEST_123", root)

        try {
            handler.handleUnexpectedException(unexpected, request)
        } finally {
            ExceptionHandlerListAppenderSupport.detach(appender)
        }

        val event = appender.list.single()
        assertThat(event.throwableProxy).isNotNull
        assertThat(event.throwableProxy.className).isEqualTo(CompletionException::class.java.name)
        assertThat(event.throwableProxy.message)
            .contains("token=[REDACTED]")
            .doesNotContain("LEAK_TEST_123")
        assertThat(event.throwableProxy.cause).isNotNull
        assertThat(event.throwableProxy.cause.className).isEqualTo(IllegalStateException::class.java.name)
        assertThat(event.throwableProxy.cause.message)
            .contains("token=[REDACTED]")
            .doesNotContain("LEAK_TEST_123")
    }

    @Test
    @DisplayName("생성자 없는 예외 타입도 스택 첫 줄에 원본 클래스명을 남긴다")
    fun `constructorless exception preserves original class name in stack`() {
        val handler = newHandler()
        val request = MockHttpServletRequest("GET", "/internal")
        val appender = ExceptionHandlerListAppenderSupport.attach()

        val unexpected =
            DateTimeParseException("failed token=LEAK_TEST_123", "2026-13-01", 5)

        try {
            handler.handleUnexpectedException(unexpected, request)
        } finally {
            ExceptionHandlerListAppenderSupport.detach(appender)
        }

        val event = appender.list.single()
        assertThat(event.throwableProxy).isNotNull
        assertThat(event.throwableProxy.className).isEqualTo(DateTimeParseException::class.java.name)
        assertThat(event.throwableProxy.message)
            .contains("token=[REDACTED]")
            .doesNotContain("LEAK_TEST_123")
    }

    @Test
    @DisplayName("redacted throwable은 원본 예외 타입과 suppressed를 보존한다")
    fun `redacted throwable preserves type and suppressed`() {
        val handler = newHandler()
        val request = MockHttpServletRequest("GET", "/internal")
        val appender = ExceptionHandlerListAppenderSupport.attach()

        val suppressed =
            IllegalStateException("close failed token=LEAK_TEST_123").apply {
                stackTrace =
                    arrayOf(
                        StackTraceElement(
                            "com.example.Closer",
                            "close",
                            "Closer.kt",
                            12,
                        ),
                    )
            }
        val unexpected =
            NullPointerException("boom token=LEAK_TEST_123").apply {
                addSuppressed(suppressed)
            }

        try {
            handler.handleUnexpectedException(unexpected, request)
        } finally {
            ExceptionHandlerListAppenderSupport.detach(appender)
        }

        val event = appender.list.single()
        assertThat(event.throwableProxy).isNotNull
        assertThat(event.throwableProxy.className).isEqualTo(NullPointerException::class.java.name)
        assertThat(event.throwableProxy.message)
            .contains("token=[REDACTED]")
            .doesNotContain("LEAK_TEST_123")
        assertThat(event.throwableProxy.suppressed).hasSize(1)
        assertThat(event.throwableProxy.suppressed[0].className)
            .isEqualTo(IllegalStateException::class.java.name)
        assertThat(event.throwableProxy.suppressed[0].message)
            .contains("token=[REDACTED]")
            .doesNotContain("LEAK_TEST_123")
    }

    @Test
    @DisplayName("4xx AppException은 warn 1줄만 남기고 스택을 포함하지 않는다")
    fun `4xx app exception records warn without stack`() {
        val handler = newHandler()
        val request = MockHttpServletRequest("GET", "/posts/private")
        val appender = ExceptionHandlerListAppenderSupport.attach()

        val response =
            try {
                handler.handleAppException(AppException(ErrorCode.NOT_FOUND, "not found token=LEAK_TEST_123"), request)
            } finally {
                ExceptionHandlerListAppenderSupport.detach(appender)
            }

        assertThat(response.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
        val event = appender.list.single()
        assertThat(event.level).isEqualTo(Level.WARN)
        assertThat(event.formattedMessage)
            .contains("app_exception status=404 method=GET path=/posts/private resultCode=404-1")
            .doesNotContain("exceptionStack=")
            .doesNotContain("\tat ")
            .doesNotContain("LEAK_TEST_123")
        assertThat(event.throwableProxy).isNull()
    }

    @Test
    @DisplayName("mvc_request_rejected warn 로그는 스택 트레이스를 남기지 않는다")
    fun `mvc request rejected warn log does not include stack trace`() {
        val handler = newHandler()
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
