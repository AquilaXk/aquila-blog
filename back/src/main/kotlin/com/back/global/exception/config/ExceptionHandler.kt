package com.back.global.exception.config

import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData
import jakarta.validation.ConstraintViolationException
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.validation.FieldError
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingRequestHeaderException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class ExceptionHandler {
    private val logger = LoggerFactory.getLogger(ExceptionHandler::class.java)

    @ExceptionHandler(NoSuchElementException::class)
    fun handleNoSuchElementException(
        @Suppress("UNUSED_PARAMETER") ex: NoSuchElementException,
    ): ResponseEntity<RsData<Void>> =
        ResponseEntity
            .status(HttpStatus.NOT_FOUND)
            .body(RsData("404-1", "해당 데이터가 존재하지 않습니다."))

    @ExceptionHandler(ConstraintViolationException::class)
    fun handleConstraintViolationException(e: ConstraintViolationException): ResponseEntity<RsData<Void>> {
        val message =
            e.constraintViolations
                .asSequence()
                .map { violation ->
                    val path = violation.propertyPath.toString()
                    val field = path.split(".", limit = 2).getOrElse(1) { path }

                    val bits = violation.messageTemplate.split(".")
                    val code = bits.getOrNull(bits.size - 2) ?: "Unknown"

                    "$field-$code-${violation.message}"
                }.sorted()
                .joinToString("\n")

        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(RsData("400-1", message))
    }

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleMethodArgumentNotValidException(e: MethodArgumentNotValidException): ResponseEntity<RsData<Void>> {
        val message =
            e.bindingResult
                .allErrors
                .asSequence()
                .filterIsInstance<FieldError>()
                .map { err -> "${err.field}-${err.code}-${err.defaultMessage}" }
                .sorted()
                .joinToString("\n")

        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(RsData("400-1", message))
    }

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun handleHttpMessageNotReadableException(
        @Suppress("UNUSED_PARAMETER") e: HttpMessageNotReadableException,
    ): ResponseEntity<RsData<Void>> =
        ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(RsData("400-1", "요청 본문이 올바르지 않습니다."))

    @ExceptionHandler(MissingRequestHeaderException::class)
    fun handleMissingRequestHeaderException(e: MissingRequestHeaderException): ResponseEntity<RsData<Void>> =
        ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(
                RsData(
                    "400-1",
                    "%s-%s-%s".format(
                        e.headerName,
                        "NotBlank",
                        e.localizedMessage,
                    ),
                ),
            )

    @ExceptionHandler(AppException::class)
    fun handleAppException(ex: AppException): ResponseEntity<RsData<Void>> =
        ResponseEntity
            .status(ex.rsData.statusCode)
            .body(ex.rsData)

    @ExceptionHandler(DataIntegrityViolationException::class)
    fun handleDataIntegrityViolationException(ex: DataIntegrityViolationException): ResponseEntity<RsData<Void>> {
        logger.warn("Data integrity violation", ex)
        return ResponseEntity
            .status(HttpStatus.CONFLICT)
            .body(RsData("409-1", "동시에 처리된 요청 충돌이 발생했습니다. 잠시 후 다시 시도해주세요."))
    }

    @ExceptionHandler(Exception::class)
    fun handleUnexpectedException(ex: Exception): ResponseEntity<RsData<Void>> {
        logger.error("Unhandled server exception", ex)
        return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(RsData("500-1", "서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요."))
    }
}
