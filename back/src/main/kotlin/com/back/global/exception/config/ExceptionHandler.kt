package com.back.global.exception.config

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.exception.application.ErrorKind
import com.back.global.jpa.application.ProdSequenceGuardService
import com.back.global.observability.ErrorMetrics
import com.back.global.rsData.RsData
import com.back.global.web.logging.SensitiveQueryRedactor
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
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.multipart.MaxUploadSizeExceededException
import org.springframework.web.multipart.MultipartException
import org.springframework.web.bind.annotation.ExceptionHandler as SpringExceptionHandler

@RestControllerAdvice
class ExceptionHandler(
    private val errorMetrics: ErrorMetrics,
    @Autowired(required = false)
    private val prodSequenceGuardService: ProdSequenceGuardService? = null,
) {
    private val logger = LoggerFactory.getLogger(ExceptionHandler::class.java)

    @SpringExceptionHandler(NoSuchElementException::class)
    fun handleNoSuchElementException(
        @Suppress("UNUSED_PARAMETER") ex: NoSuchElementException,
    ): ResponseEntity<RsData<Void>> = respond(ErrorCode.NOT_FOUND)

    @SpringExceptionHandler(ConstraintViolationException::class)
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

        return respond(ErrorCode.BAD_REQUEST, message)
    }

    @SpringExceptionHandler(MethodArgumentNotValidException::class)
    fun handleMethodArgumentNotValidException(e: MethodArgumentNotValidException): ResponseEntity<RsData<Void>> {
        val message =
            e.bindingResult
                .allErrors
                .asSequence()
                .filterIsInstance<FieldError>()
                .map { err -> "${err.field}-${err.code}-${err.defaultMessage}" }
                .sorted()
                .joinToString("\n")

        return respond(ErrorCode.BAD_REQUEST, message)
    }

    @SpringExceptionHandler(HttpMessageNotReadableException::class)
    fun handleHttpMessageNotReadableException(
        @Suppress("UNUSED_PARAMETER") e: HttpMessageNotReadableException,
    ): ResponseEntity<RsData<Void>> = respond(ErrorCode.BAD_REQUEST, "요청 본문이 올바르지 않습니다.")

    @SpringExceptionHandler(MaxUploadSizeExceededException::class)
    fun handleMaxUploadSizeExceededException(
        ex: MaxUploadSizeExceededException,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> {
        val method = sanitizeLogValue(request.method, MAX_METHOD_LENGTH)
        val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
        val reason = SensitiveQueryRedactor.redactText(ex.message, MAX_QUERY_LENGTH)
        logger.warn(
            "multipart_request_too_large method={} path={} reason={}",
            method,
            path,
            reason,
        )
        return respond(ErrorCode.PAYLOAD_TOO_LARGE)
    }

    @SpringExceptionHandler(MultipartException::class)
    fun handleMultipartException(
        ex: MultipartException,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> {
        val method = sanitizeLogValue(request.method, MAX_METHOD_LENGTH)
        val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
        val reason = SensitiveQueryRedactor.redactText(ex.message, MAX_QUERY_LENGTH)
        logger.warn(
            "multipart_request_rejected method={} path={} reason={}",
            method,
            path,
            reason,
        )
        return respond(ErrorCode.BAD_REQUEST, "업로드 요청 형식이 올바르지 않습니다. 파일을 다시 선택해주세요.")
    }

    @SpringExceptionHandler(MissingRequestHeaderException::class)
    fun handleMissingRequestHeaderException(e: MissingRequestHeaderException): ResponseEntity<RsData<Void>> =
        respond(
            ErrorCode.BAD_REQUEST,
            "%s-%s-%s".format(
                e.headerName,
                "NotBlank",
                e.localizedMessage,
            ),
        )

    @SpringExceptionHandler(AppException::class)
    fun handleAppException(
        ex: AppException,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> {
        val method = sanitizeLogValue(request.method, MAX_METHOD_LENGTH)
        val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
        val query = SensitiveQueryRedactor.redactQuery(request.queryString, MAX_QUERY_LENGTH)
        val exceptionMessage = SensitiveQueryRedactor.redactText(ex.message, MAX_QUERY_LENGTH)
        when (ex.errorCode.kind) {
            ErrorKind.USER ->
                logger.warn(
                    "app_exception status={} method={} path={} query={} resultCode={} kind={} exceptionMessage={}",
                    ex.rsData.statusCode,
                    method,
                    path,
                    query,
                    ex.rsData.resultCode,
                    ex.errorCode.kind,
                    exceptionMessage,
                )
            ErrorKind.DEVELOPER ->
                logger.error(
                    "app_exception status={} method={} path={} query={} resultCode={} kind={} exceptionClass={} exceptionMessage={}",
                    ex.rsData.statusCode,
                    method,
                    path,
                    query,
                    ex.rsData.resultCode,
                    ex.errorCode.kind,
                    ex::class.qualifiedName,
                    exceptionMessage,
                    ex,
                )
        }

        increment(ex.errorCode)

        val response =
            ResponseEntity
                .status(ex.rsData.statusCode)
                .apply {
                    if (ex.rsData.statusCode == HttpStatus.SERVICE_UNAVAILABLE.value()) {
                        header("Retry-After", "1")
                    }
                }

        return response.body(ex.rsData)
    }

    @SpringExceptionHandler(DataIntegrityViolationException::class)
    fun handleDataIntegrityViolationException(ex: DataIntegrityViolationException): ResponseEntity<RsData<Void>> {
        val repaired = prodSequenceGuardService?.repairIfSequenceDrift(ex) == true
        logger.warn("Data integrity violation", ex)
        return respond(
            ErrorCode.DB_CONFLICT,
            if (repaired) {
                "요청 충돌을 감지해 서버를 자동 보정했습니다. 잠시 후 다시 시도해주세요."
            } else {
                ErrorCode.DB_CONFLICT.defaultUserMessage
            },
        )
    }

    @SpringExceptionHandler(
        OptimisticLockingFailureException::class,
        OptimisticLockException::class,
    )
    fun handleOptimisticLockException(ex: Exception): ResponseEntity<RsData<Void>> {
        logger.warn("Optimistic lock conflict", ex)
        return respond(
            ErrorCode.DB_CONFLICT,
            "다른 요청이 먼저 반영되어 충돌이 발생했습니다. 최신 상태를 확인 후 다시 시도해주세요.",
        )
    }

    @SpringExceptionHandler(Exception::class)
    fun handleUnexpectedException(
        ex: Exception,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> {
        val method = sanitizeLogValue(request.method, MAX_METHOD_LENGTH)
        val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
        val query = SensitiveQueryRedactor.redactQuery(request.queryString, MAX_QUERY_LENGTH)
        val exceptionMessage = SensitiveQueryRedactor.redactText(ex.message, MAX_QUERY_LENGTH)
        val exceptionStack = SensitiveQueryRedactor.redactText(ex.stackTraceToString(), MAX_EXCEPTION_STACK_LENGTH)
        logger.error(
            "unhandled_server_exception method={} path={} query={} exceptionClass={} exceptionMessage={} exceptionStack={}",
            method,
            path,
            query,
            ex::class.qualifiedName,
            exceptionMessage,
            exceptionStack,
        )
        return respond(ErrorCode.INTERNAL_ERROR)
    }

    private fun respond(
        errorCode: ErrorCode,
        message: String? = null,
    ): ResponseEntity<RsData<Void>> {
        increment(errorCode)
        return ResponseEntity
            .status(errorCode.status)
            .body(if (message == null) errorCode.toRsData() else errorCode.toRsData(message))
    }

    private fun increment(errorCode: ErrorCode) {
        errorMetrics.increment(
            code = errorCode.code,
            status = errorCode.status.value(),
            source = ErrorMetrics.SOURCE_HANDLER,
        )
    }

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
        private const val MAX_EXCEPTION_STACK_LENGTH = 4096
        private val LOG_CONTROL_CHAR_REGEX = Regex("[\\x00-\\x1F\\x7F]")
    }
}
