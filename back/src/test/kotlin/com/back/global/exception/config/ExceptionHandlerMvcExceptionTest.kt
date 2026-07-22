package com.back.global.exception.config

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean
import org.springframework.web.servlet.NoHandlerFoundException
import org.springframework.web.servlet.resource.NoResourceFoundException
import java.util.stream.Stream

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
        appender = ExceptionHandlerListAppenderSupport.attach()
    }

    @AfterEach
    fun tearDown() {
        ExceptionHandlerListAppenderSupport.detach(appender)
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("mvcClientErrorCases")
    fun `maps spring mvc client errors`(
        @Suppress("UNUSED_PARAMETER") displayName: String,
        request: MockHttpServletRequestBuilder,
        expectedStatus: Int,
        resultCode: String,
        msg: String,
        exceptionClass: String,
        expectedAllow: String?,
    ) {
        val actions =
            mockMvc
                .perform(request)
                .andExpect(status().`is`(expectedStatus))
                .andExpect(jsonPath("$.resultCode").value(resultCode))
                .andExpect(jsonPath("$.msg").value(msg))
        expectAllowHeader(actions, expectedAllow)
        assertWarnLogWithoutStack(exceptionClass)
    }

    @Test
    @DisplayName("NoHandlerFoundException 직접 매핑 -> 404-1")
    fun `maps no handler found exception to 404-1`() {
        val response =
            ExceptionHandler().handleNotFoundMappingException(
                NoHandlerFoundException("GET", "/missing-unmapped", HttpHeaders()),
                MockHttpServletRequest("GET", "/missing-unmapped"),
            )
        assertThat(response.statusCode.value()).isEqualTo(404)
        assertThat(response.body?.resultCode).isEqualTo("404-1")
        assertThat(response.body?.msg).isEqualTo("해당 데이터가 존재하지 않습니다.")
    }

    @Test
    @DisplayName("NoResourceFoundException 직접 매핑 -> 404-1")
    fun `maps no resource found exception to 404-1`() {
        val response =
            ExceptionHandler().handleNotFoundMappingException(
                NoResourceFoundException(HttpMethod.GET, "/missing-resource", "/missing-resource"),
                MockHttpServletRequest("GET", "/missing-resource"),
            )
        assertThat(response.statusCode.value()).isEqualTo(404)
        assertThat(response.body?.resultCode).isEqualTo("404-1")
    }

    private fun expectAllowHeader(
        actions: ResultActions,
        expectedAllow: String?,
    ) {
        if (expectedAllow != null) {
            actions.andExpect(header().string("Allow", expectedAllow))
        }
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

    companion object {
        @JvmStatic
        fun mvcClientErrorCases(): Stream<Arguments> =
            Stream.of(
                Arguments.of(
                    "HttpRequestMethodNotSupportedException -> 405-1 + Allow",
                    post("/mvc-exception-fixture/ok"),
                    405,
                    "405-1",
                    "지원하지 않는 요청 방식입니다.",
                    "org.springframework.web.HttpRequestMethodNotSupportedException",
                    "GET",
                ),
                Arguments.of(
                    "MethodArgumentTypeMismatchException -> 400-1",
                    get("/mvc-exception-fixture/type-mismatch/not-a-number"),
                    400,
                    "400-1",
                    "요청 값 형식이 올바르지 않습니다.",
                    "org.springframework.web.method.annotation.MethodArgumentTypeMismatchException",
                    null,
                ),
                Arguments.of(
                    "MissingServletRequestParameterException -> 400-1",
                    get("/mvc-exception-fixture/missing-param"),
                    400,
                    "400-1",
                    "필수 요청 값이 누락되었습니다: required",
                    "org.springframework.web.bind.MissingServletRequestParameterException",
                    null,
                ),
                Arguments.of(
                    "HandlerMethodValidationException -> 400-1 field-code-message",
                    get("/mvc-exception-fixture/method-validation").param("id", "0"),
                    400,
                    "400-1",
                    "id-Min-must be greater than or equal to 1",
                    "org.springframework.web.method.annotation.HandlerMethodValidationException",
                    null,
                ),
                Arguments.of(
                    "HttpMediaTypeNotSupportedException -> 415-1",
                    post("/mvc-exception-fixture/json-only")
                        .contentType(MediaType.TEXT_PLAIN)
                        .content("plain"),
                    415,
                    "415-1",
                    "지원하지 않는 요청 형식입니다.",
                    "org.springframework.web.HttpMediaTypeNotSupportedException",
                    null,
                ),
                Arguments.of(
                    "HttpMediaTypeNotAcceptableException -> 406-1",
                    get("/mvc-exception-fixture/json-response").accept(MediaType.APPLICATION_XML),
                    406,
                    "406-1",
                    "지원하지 않는 응답 형식입니다.",
                    "org.springframework.web.HttpMediaTypeNotAcceptableException",
                    null,
                ),
                Arguments.of(
                    "NoHandlerFoundException unmapped URL -> 404-1",
                    get("/mvc-exception-fixture/definitely-unmapped"),
                    404,
                    "404-1",
                    "해당 데이터가 존재하지 않습니다.",
                    "org.springframework.web.servlet.NoHandlerFoundException",
                    null,
                ),
            )
    }
}
