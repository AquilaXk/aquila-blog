package com.back.global.exception.config

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean

@DisplayName("ExceptionHandler Spring MVC 표준 예외 매핑 테스트")
class ExceptionHandlerMvcExceptionTest {
    private lateinit var mockMvc: MockMvc
    private lateinit var appender: ListAppender<ILoggingEvent>

    @BeforeEach
    fun setUp() {
        val validator =
            LocalValidatorFactoryBean().also {
                it.afterPropertiesSet()
            }
        mockMvc =
            MockMvcBuilders
                .standaloneSetup(MvcExceptionFixtureController())
                .setControllerAdvice(ExceptionHandler())
                .setValidator(validator)
                .build()
        appender = attachListAppender()
    }

    @AfterEach
    fun tearDown() {
        detachListAppender(appender)
    }

    @Test
    @DisplayName("HttpRequestMethodNotSupportedException -> 405-1")
    fun `maps method not supported to 405-1`() {
        mockMvc
            .perform(post("/mvc-exception-fixture/ok"))
            .andExpect(status().isMethodNotAllowed)
            .andExpect(jsonPath("$.resultCode").value("405-1"))
            .andExpect(jsonPath("$.msg").value("지원하지 않는 요청 방식입니다."))

        assertWarnLogWithoutStack(
            "org.springframework.web.HttpRequestMethodNotSupportedException",
        )
    }

    @Test
    @DisplayName("MethodArgumentTypeMismatchException -> 400-1")
    fun `maps type mismatch to 400-1`() {
        mockMvc
            .perform(get("/mvc-exception-fixture/type-mismatch/not-a-number"))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.resultCode").value("400-1"))
            .andExpect(jsonPath("$.msg").value("요청 값 형식이 올바르지 않습니다."))

        assertWarnLogWithoutStack(
            "org.springframework.web.method.annotation.MethodArgumentTypeMismatchException",
        )
    }

    @Test
    @DisplayName("MissingServletRequestParameterException -> 400-1")
    fun `maps missing request parameter to 400-1`() {
        mockMvc
            .perform(get("/mvc-exception-fixture/missing-param"))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.resultCode").value("400-1"))
            .andExpect(jsonPath("$.msg").value("필수 요청 값이 누락되었습니다: required"))

        assertWarnLogWithoutStack(
            "org.springframework.web.bind.MissingServletRequestParameterException",
        )
    }

    @Test
    @DisplayName("HandlerMethodValidationException -> 400-1 field-code-message")
    fun `maps handler method validation to 400-1`() {
        mockMvc
            .perform(get("/mvc-exception-fixture/handler-method-validation"))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.resultCode").value("400-1"))
            .andExpect(jsonPath("$.msg").value("id-Min-must be greater than or equal to 1"))

        assertWarnLogWithoutStack(
            "org.springframework.web.method.annotation.HandlerMethodValidationException",
        )
    }

    @Test
    @DisplayName("HttpMediaTypeNotSupportedException -> 415-1")
    fun `maps unsupported media type to 415-1`() {
        mockMvc
            .perform(
                post("/mvc-exception-fixture/json-only")
                    .contentType(MediaType.TEXT_PLAIN)
                    .content("plain"),
            ).andExpect(status().isUnsupportedMediaType)
            .andExpect(jsonPath("$.resultCode").value("415-1"))
            .andExpect(jsonPath("$.msg").value("지원하지 않는 요청 형식입니다."))

        assertWarnLogWithoutStack(
            "org.springframework.web.HttpMediaTypeNotSupportedException",
        )
    }

    @Test
    @DisplayName("HttpMediaTypeNotAcceptableException -> 406-1")
    fun `maps not acceptable media type to 406-1`() {
        mockMvc
            .perform(
                get("/mvc-exception-fixture/json-response")
                    .accept(MediaType.APPLICATION_XML),
            ).andExpect(status().isNotAcceptable)
            .andExpect(jsonPath("$.resultCode").value("406-1"))
            .andExpect(jsonPath("$.msg").value("지원하지 않는 응답 형식입니다."))

        assertWarnLogWithoutStack(
            "org.springframework.web.HttpMediaTypeNotAcceptableException",
        )
    }

    @Test
    @DisplayName("NoResourceFoundException -> 404-1")
    fun `maps no resource found to 404-1`() {
        mockMvc
            .perform(get("/mvc-exception-fixture/no-resource"))
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.resultCode").value("404-1"))
            .andExpect(jsonPath("$.msg").value("해당 데이터가 존재하지 않습니다."))

        assertWarnLogWithoutStack(
            "org.springframework.web.servlet.resource.NoResourceFoundException",
        )
    }

    private fun assertWarnLogWithoutStack(exceptionClass: String) {
        val event =
            appender.list.single {
                it.level == Level.WARN && it.formattedMessage.contains("mvc_request_rejected")
            }
        assertThat(event.formattedMessage)
            .contains("mvc_request_rejected")
            .contains("exceptionClass=$exceptionClass")
            .contains("method=")
            .contains("path=")
            .contains("reason=")
            .doesNotContain("exceptionStack=")
            .doesNotContain("\tat ")
        assertThat(event.throwableProxy).isNull()
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
