package com.back.global.exception.config

import com.back.global.exception.application.AppException
import com.back.global.jpa.application.ProdSequenceGuardService
import com.back.global.rsData.RsData
import jakarta.persistence.OptimisticLockException
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.ConstraintViolationException
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.validation.FieldError
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingRequestHeaderException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

/**
 * ExceptionHandler는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */

@RestControllerAdvice
class ExceptionHandler(
    @Autowired(required = false)
    private val prodSequenceGuardService: ProdSequenceGuardService? = null,
) {
    private val logger = LoggerFactory.getLogger(ExceptionHandler::class.java)

    /**
     * 예외 또는 이벤트를 수신해 표준 처리 흐름으로 변환합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    @ExceptionHandler(NoSuchElementException::class)
    fun handleNoSuchElementException(
        @Suppress("UNUSED_PARAMETER") ex: NoSuchElementException,
    ): ResponseEntity<RsData<Void>> =
        ResponseEntity
            .status(HttpStatus.NOT_FOUND)
            .body(RsData("404-1", "해당 데이터가 존재하지 않습니다."))

    /**
     * 예외 또는 이벤트를 수신해 표준 처리 흐름으로 변환합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
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

    /**
     * 예외 또는 이벤트를 수신해 표준 처리 흐름으로 변환합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
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

    /**
     * 예외 또는 이벤트를 수신해 표준 처리 흐름으로 변환합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
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
    fun handleAppException(
        ex: AppException,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> {
        if (ex.rsData.statusCode >= 500) {
            val method = sanitizeLogValue(request.method, MAX_METHOD_LENGTH)
            val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
            val query = normalizeQueryString(request.queryString)
            logger.error(
                "app_exception status={} method={} path={} query={} resultCode={}",
                ex.rsData.statusCode,
                method,
                path,
                query,
                ex.rsData.resultCode,
                ex,
            )
        }

        return ResponseEntity
            .status(ex.rsData.statusCode)
            .body(ex.rsData)
    }

    /**
     * 예외 또는 이벤트를 수신해 표준 처리 흐름으로 변환합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    @ExceptionHandler(DataIntegrityViolationException::class)
    fun handleDataIntegrityViolationException(ex: DataIntegrityViolationException): ResponseEntity<RsData<Void>> {
        val repaired = prodSequenceGuardService?.repairIfSequenceDrift(ex) == true
        logger.warn("Data integrity violation", ex)
        return ResponseEntity
            .status(HttpStatus.CONFLICT)
            .body(
                RsData(
                    "409-1",
                    if (repaired) {
                        "요청 충돌을 감지해 서버를 자동 보정했습니다. 잠시 후 다시 시도해주세요."
                    } else {
                        "동시에 처리된 요청 충돌이 발생했습니다. 잠시 후 다시 시도해주세요."
                    },
                ),
            )
    }

    @ExceptionHandler(
        OptimisticLockingFailureException::class,
        OptimisticLockException::class,
    )
    fun handleOptimisticLockException(ex: Exception): ResponseEntity<RsData<Void>> {
        logger.warn("Optimistic lock conflict", ex)
        return ResponseEntity
            .status(HttpStatus.CONFLICT)
            .body(RsData("409-1", "다른 요청이 먼저 반영되어 충돌이 발생했습니다. 최신 상태를 확인 후 다시 시도해주세요."))
    }

    @ExceptionHandler(Exception::class)
    fun handleUnexpectedException(
        ex: Exception,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> {
        val method = sanitizeLogValue(request.method, MAX_METHOD_LENGTH)
        val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
        val query = normalizeQueryString(request.queryString)
        logger.error(
            "unhandled_server_exception method={} path={} query={}",
            method,
            path,
            query,
            ex,
        )
        return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(RsData("500-1", "서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요."))
    }

    private fun normalizeQueryString(rawQuery: String?): String = sanitizeLogValue(rawQuery, MAX_QUERY_LENGTH)

    private fun sanitizeLogValue(
        raw: String?,
        maxLength: Int,
    ): String {
        if (raw.isNullOrBlank()) return "-"

        val sanitized =
            raw
                .replace('\r', ' ')
                .replace('\n', ' ')
                .replace('\t', ' ')
                .replace(LOG_CONTROL_CHAR_REGEX, "?")
                .trim()

        if (sanitized.isBlank()) return "-"
        return sanitized.take(maxLength)
    }

    companion object {
        private const val MAX_METHOD_LENGTH = 16
        private const val MAX_PATH_LENGTH = 512
        private const val MAX_QUERY_LENGTH = 512
        private val LOG_CONTROL_CHAR_REGEX = Regex("[\\x00-\\x1F\\x7F]")
    }
}
