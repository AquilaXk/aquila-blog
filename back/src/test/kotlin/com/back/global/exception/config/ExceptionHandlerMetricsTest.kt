package com.back.global.exception.config

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.observability.ErrorMetrics
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import jakarta.persistence.OptimisticLockException
import jakarta.validation.ConstraintViolation
import jakarta.validation.ConstraintViolationException
import jakarta.validation.Path
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.core.MethodParameter
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpInputMessage
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.validation.BeanPropertyBindingResult
import org.springframework.validation.FieldError
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingRequestHeaderException
import org.springframework.web.multipart.MaxUploadSizeExceededException
import org.springframework.web.multipart.MultipartException
import java.lang.reflect.Method

@DisplayName("ExceptionHandler ErrorMetrics 테스트")
class ExceptionHandlerMetricsTest {
    private val meterRegistry = SimpleMeterRegistry()
    private val handler = ExceptionHandler(ErrorMetrics(meterRegistry))
    private val request = MockHttpServletRequest("GET", "/test")

    @Test
    @DisplayName("NoSuchElementException은 source=handler 메트릭을 올린다")
    fun `no such element increments handler metric`() {
        handler.handleNoSuchElementException(NoSuchElementException("missing"))
        assertMetric(ErrorCode.NOT_FOUND)
    }

    @Test
    @DisplayName("ConstraintViolationException은 source=handler 메트릭을 올린다")
    fun `constraint violation increments handler metric`() {
        @Suppress("UNCHECKED_CAST")
        val violation = mock(ConstraintViolation::class.java) as ConstraintViolation<Any>
        val path = mock(Path::class.java)
        `when`(path.toString()).thenReturn("arg.name")
        `when`(violation.propertyPath).thenReturn(path)
        `when`(violation.messageTemplate).thenReturn("{jakarta.validation.constraints.NotBlank.message}")
        `when`(violation.message).thenReturn("must not be blank")

        handler.handleConstraintViolationException(ConstraintViolationException(setOf(violation)))
        assertMetric(ErrorCode.BAD_REQUEST)
    }

    @Test
    @DisplayName("MethodArgumentNotValidException은 source=handler 메트릭을 올린다")
    fun `method argument not valid increments handler metric`() {
        val bindingResult =
            BeanPropertyBindingResult(Any(), "target").apply {
                addError(FieldError("target", "title", null, false, arrayOf("NotBlank"), null, "must not be blank"))
            }
        val method: Method = Sample::class.java.getDeclaredMethod("echo", String::class.java)
        val parameter = MethodParameter(method, 0)

        handler.handleMethodArgumentNotValidException(MethodArgumentNotValidException(parameter, bindingResult))
        assertMetric(ErrorCode.BAD_REQUEST)
    }

    @Test
    @DisplayName("HttpMessageNotReadableException은 source=handler 메트릭을 올린다")
    fun `http message not readable increments handler metric`() {
        handler.handleHttpMessageNotReadableException(
            HttpMessageNotReadableException("bad body", mock(HttpInputMessage::class.java)),
        )
        assertMetric(ErrorCode.BAD_REQUEST)
    }

    @Test
    @DisplayName("MaxUploadSizeExceededException은 source=handler 메트릭을 올린다")
    fun `max upload size exceeded increments handler metric`() {
        handler.handleMaxUploadSizeExceededException(MaxUploadSizeExceededException(1024), request)
        assertMetric(ErrorCode.PAYLOAD_TOO_LARGE)
    }

    @Test
    @DisplayName("MultipartException은 source=handler 메트릭을 올린다")
    fun `multipart exception increments handler metric`() {
        handler.handleMultipartException(MultipartException("bad multipart"), request)
        assertMetric(ErrorCode.BAD_REQUEST)
    }

    @Test
    @DisplayName("MissingRequestHeaderException은 source=handler 메트릭을 올린다")
    fun `missing request header increments handler metric`() {
        handler.handleMissingRequestHeaderException(MissingRequestHeaderException("X-Test", sampleParameter()))
        assertMetric(ErrorCode.BAD_REQUEST)
    }

    @Test
    @DisplayName("AppException은 source=handler 메트릭을 올린다")
    fun `app exception increments handler metric`() {
        handler.handleAppException(AppException(ErrorCode.ACCESS_DENIED), request)
        assertMetric(ErrorCode.ACCESS_DENIED)
    }

    @Test
    @DisplayName("DataIntegrityViolationException은 source=handler 메트릭을 올린다")
    fun `data integrity violation increments handler metric`() {
        handler.handleDataIntegrityViolationException(DataIntegrityViolationException("conflict"))
        assertMetric(ErrorCode.DB_CONFLICT)
    }

    @Test
    @DisplayName("OptimisticLockException은 source=handler 메트릭을 올린다")
    fun `optimistic lock increments handler metric`() {
        handler.handleOptimisticLockException(OptimisticLockException("stale"))
        assertMetric(ErrorCode.DB_CONFLICT)
    }

    @Test
    @DisplayName("OptimisticLockingFailureException은 source=handler 메트릭을 올린다")
    fun `optimistic locking failure increments handler metric`() {
        handler.handleOptimisticLockException(OptimisticLockingFailureException("stale"))
        assertMetric(ErrorCode.DB_CONFLICT)
    }

    @Test
    @DisplayName("unexpected Exception은 source=handler 메트릭을 올린다")
    fun `unexpected exception increments handler metric`() {
        handler.handleUnexpectedException(RuntimeException("boom"), request)
        assertMetric(ErrorCode.INTERNAL_ERROR)
    }

    private fun assertMetric(errorCode: ErrorCode) {
        assertThat(
            meterRegistry
                .find(ErrorMetrics.METRIC_NAME)
                .tag("code", errorCode.code)
                .tag("status", errorCode.status.value().toString())
                .tag("source", ErrorMetrics.SOURCE_HANDLER)
                .counter()
                ?.count(),
        ).isEqualTo(1.0)
    }

    private fun sampleParameter(): MethodParameter {
        val method: Method = Sample::class.java.getDeclaredMethod("echo", String::class.java)
        return MethodParameter(method, 0)
    }

    private class Sample {
        @Suppress("UNUSED")
        fun echo(value: String): String = value
    }
}
