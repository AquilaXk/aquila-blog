package com.back.global.web.config

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.back.global.web.application.ClientIpResolver
import jakarta.servlet.FilterChain
import jakarta.servlet.ServletRequest
import jakarta.servlet.ServletResponse
import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

@DisplayName("RequestCorrelationFilter 테스트")
class RequestCorrelationFilterTest {
    private val clientIpResolver = ClientIpResolver()

    @Test
    @DisplayName("slow request 로그는 민감 query value를 남기지 않는다")
    fun `slow request log redacts sensitive query values`() {
        val filter = RequestCorrelationFilter(clientIpResolver, slowRequestThresholdMs = 0)
        val request =
            MockHttpServletRequest("GET", "/post/api/v1/posts/search").apply {
                queryString = "token=LEAK_TEST_123&kw=private&page=1"
                remoteAddr = "203.0.113.10"
            }
        val response = MockHttpServletResponse()
        val appender = attachListAppender()

        try {
            filter.doFilter(
                request,
                response,
                FilterChain { _: ServletRequest, servletResponse: ServletResponse ->
                    (servletResponse as HttpServletResponse).status = HttpServletResponse.SC_OK
                },
            )
        } finally {
            detachListAppender(appender)
        }

        val messages = appender.list.map { it.formattedMessage }
        assertThat(messages).hasSize(1)
        assertThat(messages.single())
            .contains("query=token=[REDACTED]&kw=[REDACTED]&page=1")
            .doesNotContain("LEAK_TEST_123")
            .doesNotContain("private")
    }

    @Test
    @DisplayName("직접 유입에서 spoof X-Forwarded-For는 correlation remoteIp로 채택되지 않는다")
    fun `spoofed xff is not adopted as correlation remoteIp`() {
        val filter = RequestCorrelationFilter(clientIpResolver, slowRequestThresholdMs = 0)
        val request =
            MockHttpServletRequest("GET", "/post/api/v1/posts/search").apply {
                remoteAddr = "203.0.113.10"
                addHeader("X-Forwarded-For", "198.51.100.99")
                addHeader("CF-Connecting-IP", "198.51.100.88")
            }
        val response = MockHttpServletResponse()
        val appender = attachListAppender()

        try {
            filter.doFilter(
                request,
                response,
                FilterChain { _: ServletRequest, servletResponse: ServletResponse ->
                    (servletResponse as HttpServletResponse).status = HttpServletResponse.SC_OK
                },
            )
        } finally {
            detachListAppender(appender)
        }

        val message = appender.list.map { it.formattedMessage }.single()
        assertThat(message)
            .contains("remoteIp=203.0.113.10")
            .doesNotContain("198.51.100.99")
            .doesNotContain("198.51.100.88")
    }

    @Test
    @DisplayName("신뢰 프록시에서는 ClientIpResolver가 고른 CF-Connecting-IP를 remoteIp로 기록한다")
    fun `trusted proxy correlation remoteIp uses client ip resolver`() {
        val filter = RequestCorrelationFilter(clientIpResolver, slowRequestThresholdMs = 0)
        val request =
            MockHttpServletRequest("GET", "/post/api/v1/posts/search").apply {
                remoteAddr = "172.18.0.5"
                addHeader("X-Forwarded-For", "198.51.100.99")
                addHeader("CF-Connecting-IP", "198.51.100.24")
            }
        val response = MockHttpServletResponse()
        val appender = attachListAppender()

        try {
            filter.doFilter(
                request,
                response,
                FilterChain { _: ServletRequest, servletResponse: ServletResponse ->
                    (servletResponse as HttpServletResponse).status = HttpServletResponse.SC_OK
                },
            )
        } finally {
            detachListAppender(appender)
        }

        val message = appender.list.map { it.formattedMessage }.single()
        assertThat(message)
            .contains("remoteIp=198.51.100.24")
            .doesNotContain("198.51.100.99")
    }

    private fun attachListAppender(): ListAppender<ILoggingEvent> {
        val logger = LoggerFactory.getLogger(RequestCorrelationFilter::class.java) as Logger
        return ListAppender<ILoggingEvent>().also {
            it.start()
            logger.addAppender(it)
        }
    }

    private fun detachListAppender(appender: ListAppender<ILoggingEvent>) {
        val logger = LoggerFactory.getLogger(RequestCorrelationFilter::class.java) as Logger
        logger.detachAppender(appender)
    }
}
