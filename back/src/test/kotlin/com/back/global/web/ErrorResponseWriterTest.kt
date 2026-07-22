package com.back.global.web

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.back.global.exception.application.ErrorCode
import com.back.global.observability.ErrorMetrics
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

@DisplayName("ErrorResponseWriter 테스트")
class ErrorResponseWriterTest {
    @Test
    @DisplayName("RsData JSON과 Content-Type을 쓰고 code/status/source 메트릭을 올린다")
    fun `writes rsdata json content type and increments metrics`() {
        val meterRegistry = SimpleMeterRegistry()
        val writer = ErrorResponseWriterTestSupport.createWriter(meterRegistry)
        val request = MockHttpServletRequest("GET", "/member/api/v1/members/me")
        val response = MockHttpServletResponse()

        writer.write(
            request = request,
            response = response,
            errorCode = ErrorCode.UNAUTHORIZED,
            source = ErrorResponseSource.SECURITY,
        )

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED)
        assertThat(response.contentType).isEqualTo(ErrorResponseWriter.CONTENT_TYPE)
        assertThat(response.contentAsString)
            .contains("\"resultCode\":\"401-1\"")
            .contains("\"msg\":\"로그인 후 이용해주세요.\"")
            .doesNotContain("\"bucket\"")
        assertThat(
            meterRegistry
                .find(ErrorMetrics.METRIC_NAME)
                .tag("code", "401-1")
                .tag("status", "401")
                .tag("source", "security")
                .counter()
                ?.count(),
        ).isEqualTo(1.0)
    }

    @Test
    @DisplayName("구조화 로그는 민감 query를 redaction하고 path를 메트릭 태그로 쓰지 않는다")
    fun `structured log redacts sensitive query and metrics omit path tag`() {
        val meterRegistry = SimpleMeterRegistry()
        val writer = ErrorResponseWriterTestSupport.createWriter(meterRegistry)
        val request =
            MockHttpServletRequest("GET", "/member/api/v1/signup/email/verify").apply {
                queryString = "token=LEAK_TEST_123&email=test@example.com"
            }
        val response = MockHttpServletResponse()
        val appender = attachListAppender()

        try {
            writer.write(
                request = request,
                response = response,
                errorCode = ErrorCode.CSRF_PREFLIGHT_REQUIRED,
                source = ErrorResponseSource.FILTER,
            )
        } finally {
            detachListAppender(appender)
        }

        assertThat(appender.list.single().formattedMessage)
            .contains("query=token=[REDACTED]&email=[REDACTED]")
            .contains("source=filter")
            .contains("resultCode=403-3")
            .doesNotContain("LEAK_TEST_123")
        assertThat(
            meterRegistry
                .find(ErrorMetrics.METRIC_NAME)
                .counter()
                ?.id
                ?.tags
                ?.map { it.key },
        ).containsExactlyInAnyOrder("code", "status", "source")
    }

    @Test
    @DisplayName("Retry-After 헤더를 선택적으로 붙인다")
    fun `writes optional retry after header`() {
        val writer = ErrorResponseWriterTestSupport.createWriter()
        val response = MockHttpServletResponse()

        writer.write(
            request = MockHttpServletRequest("GET", "/post/api/v1/posts/feed"),
            response = response,
            errorCode = ErrorCode.API_RATE_LIMITED,
            source = ErrorResponseSource.FILTER,
            retryAfterSeconds = 60,
        )

        assertThat(response.status).isEqualTo(429)
        assertThat(response.getHeader("Retry-After")).isEqualTo("60")
        assertThat(response.contentAsString).contains("\"resultCode\":\"429-10\"")
    }

    private fun attachListAppender(): ListAppender<ILoggingEvent> {
        val logger = LoggerFactory.getLogger(ErrorResponseWriter::class.java) as Logger
        return ListAppender<ILoggingEvent>().also {
            it.start()
            logger.addAppender(it)
        }
    }

    private fun detachListAppender(appender: ListAppender<ILoggingEvent>) {
        val logger = LoggerFactory.getLogger(ErrorResponseWriter::class.java) as Logger
        logger.detachAppender(appender)
        appender.stop()
    }
}
