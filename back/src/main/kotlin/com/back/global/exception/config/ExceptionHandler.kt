package com.back.global.exception.config

import com.back.global.exception.application.AppException
import com.back.global.jpa.application.ProdSequenceGuardService
import com.back.global.rsData.RsData
import com.back.global.web.logging.SensitiveQueryRedactor
import jakarta.persistence.OptimisticLockException
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.ConstraintViolationException
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.MessageSourceResolvable
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.validation.FieldError
import org.springframework.web.HttpMediaTypeNotAcceptableException
import org.springframework.web.HttpMediaTypeNotSupportedException
import org.springframework.web.HttpRequestMethodNotSupportedException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingRequestHeaderException
import org.springframework.web.bind.MissingServletRequestParameterException
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.HandlerMethodValidationException
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import org.springframework.web.multipart.MaxUploadSizeExceededException
import org.springframework.web.multipart.MultipartException
import org.springframework.web.servlet.NoHandlerFoundException
import org.springframework.web.servlet.resource.NoResourceFoundException
import java.util.IdentityHashMap
import org.springframework.web.bind.annotation.ExceptionHandler as SpringExceptionHandler

@RestControllerAdvice
class ExceptionHandler(
    @Autowired(required = false)
    private val prodSequenceGuardService: ProdSequenceGuardService? = null,
) {
    private val logger = LoggerFactory.getLogger(ExceptionHandler::class.java)

    @SpringExceptionHandler(NoSuchElementException::class)
    fun handleNoSuchElementException(
        @Suppress("UNUSED_PARAMETER") ex: NoSuchElementException,
    ): ResponseEntity<RsData<Void>> =
        ResponseEntity
            .status(HttpStatus.NOT_FOUND)
            .body(RsData("404-1", "해당 데이터가 존재하지 않습니다."))

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

        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(RsData("400-1", message))
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

        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(RsData("400-1", message))
    }

    @SpringExceptionHandler(HandlerMethodValidationException::class)
    fun handleHandlerMethodValidationException(
        e: HandlerMethodValidationException,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> {
        if (e.isForReturnValue) {
            return handleUnexpectedException(e, request)
        }
        return mvcClientError(
            status = HttpStatus.BAD_REQUEST,
            resultCode = "400-1",
            message = formatHandlerMethodValidationMessage(e),
            ex = e,
            request = request,
        )
    }

    @SpringExceptionHandler(HttpRequestMethodNotSupportedException::class)
    fun handleHttpRequestMethodNotSupportedException(
        e: HttpRequestMethodNotSupportedException,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> =
        mvcClientError(
            status = HttpStatus.METHOD_NOT_ALLOWED,
            resultCode = "405-1",
            message = "지원하지 않는 요청 방식입니다.",
            ex = e,
            request = request,
            headers = e.headers,
        )

    @SpringExceptionHandler(MethodArgumentTypeMismatchException::class)
    fun handleMethodArgumentTypeMismatchException(
        e: MethodArgumentTypeMismatchException,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> =
        mvcClientError(
            status = HttpStatus.BAD_REQUEST,
            resultCode = "400-1",
            message = "요청 값 형식이 올바르지 않습니다.",
            ex = e,
            request = request,
        )

    @SpringExceptionHandler(MissingServletRequestParameterException::class)
    fun handleMissingServletRequestParameterException(
        e: MissingServletRequestParameterException,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> =
        mvcClientError(
            status = HttpStatus.BAD_REQUEST,
            resultCode = "400-1",
            message = "필수 요청 값이 누락되었습니다: ${e.parameterName}",
            ex = e,
            request = request,
        )

    @SpringExceptionHandler(HttpMediaTypeNotSupportedException::class)
    fun handleHttpMediaTypeNotSupportedException(
        e: HttpMediaTypeNotSupportedException,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> =
        mvcClientError(
            status = HttpStatus.UNSUPPORTED_MEDIA_TYPE,
            resultCode = "415-1",
            message = "지원하지 않는 요청 형식입니다.",
            ex = e,
            request = request,
            headers = e.headers,
        )

    @SpringExceptionHandler(HttpMediaTypeNotAcceptableException::class)
    fun handleHttpMediaTypeNotAcceptableException(
        e: HttpMediaTypeNotAcceptableException,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> =
        mvcClientError(
            status = HttpStatus.NOT_ACCEPTABLE,
            resultCode = "406-1",
            message = "지원하지 않는 응답 형식입니다.",
            ex = e,
            request = request,
            headers = e.headers,
            contentType = MediaType.APPLICATION_JSON,
        )

    @SpringExceptionHandler(
        NoResourceFoundException::class,
        NoHandlerFoundException::class,
    )
    fun handleNotFoundMappingException(
        e: Exception,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> =
        mvcClientError(
            status = HttpStatus.NOT_FOUND,
            resultCode = "404-1",
            message = "해당 데이터가 존재하지 않습니다.",
            ex = e,
            request = request,
        )

    @SpringExceptionHandler(HttpMessageNotReadableException::class)
    fun handleHttpMessageNotReadableException(
        @Suppress("UNUSED_PARAMETER") e: HttpMessageNotReadableException,
    ): ResponseEntity<RsData<Void>> =
        ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(RsData("400-1", "요청 본문이 올바르지 않습니다."))

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
        return ResponseEntity
            .status(HttpStatus.PAYLOAD_TOO_LARGE)
            .body(RsData("413-1", "업로드 가능한 파일 용량을 초과했습니다. 허용 크기 이내 파일로 다시 시도해주세요."))
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
        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(RsData("400-1", "업로드 요청 형식이 올바르지 않습니다. 파일을 다시 선택해주세요."))
    }

    @SpringExceptionHandler(MissingRequestHeaderException::class)
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

    @SpringExceptionHandler(AppException::class)
    fun handleAppException(
        ex: AppException,
        request: HttpServletRequest,
    ): ResponseEntity<RsData<Void>> {
        val method = sanitizeLogValue(request.method, MAX_METHOD_LENGTH)
        val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
        if (ex.rsData.statusCode >= 500) {
            val query = SensitiveQueryRedactor.redactQuery(request.queryString, MAX_QUERY_LENGTH)
            val exceptionMessage = SensitiveQueryRedactor.redactText(ex.message, MAX_QUERY_LENGTH)
            logger.error(
                "app_exception status={} method={} path={} query={} resultCode={} exceptionClass={} exceptionMessage={}",
                ex.rsData.statusCode,
                method,
                path,
                query,
                ex.rsData.resultCode,
                ex::class.qualifiedName,
                exceptionMessage,
                redactedThrowableForLogging(ex),
            )
        } else {
            logger.warn(
                "app_exception status={} method={} path={} resultCode={}",
                ex.rsData.statusCode,
                method,
                path,
                ex.rsData.resultCode,
            )
        }

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

    @SpringExceptionHandler(
        OptimisticLockingFailureException::class,
        OptimisticLockException::class,
    )
    fun handleOptimisticLockException(ex: Exception): ResponseEntity<RsData<Void>> {
        logger.warn("Optimistic lock conflict", ex)
        return ResponseEntity
            .status(HttpStatus.CONFLICT)
            .body(RsData("409-1", "다른 요청이 먼저 반영되어 충돌이 발생했습니다. 최신 상태를 확인 후 다시 시도해주세요."))
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
        logger.error(
            "unhandled_server_exception method={} path={} query={} exceptionClass={} exceptionMessage={}",
            method,
            path,
            query,
            ex::class.qualifiedName,
            exceptionMessage,
            redactedThrowableForLogging(ex),
        )
        return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(RsData("500-1", "서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요."))
    }

    private fun mvcClientError(
        status: HttpStatus,
        resultCode: String,
        message: String,
        ex: Exception,
        request: HttpServletRequest,
        headers: HttpHeaders = HttpHeaders.EMPTY,
        contentType: MediaType? = null,
    ): ResponseEntity<RsData<Void>> {
        logMvcRequestRejected(ex, request)
        val builder =
            ResponseEntity
                .status(status)
                .headers(headers)
        if (contentType != null) {
            builder.contentType(contentType)
        }
        return builder.body(RsData(resultCode, message))
    }

    private fun formatHandlerMethodValidationMessage(e: HandlerMethodValidationException): String {
        val parameterMessages =
            e.parameterValidationResults
                .asSequence()
                .flatMap { result ->
                    val parameterName = result.methodParameter.parameterName ?: "value"
                    result.resolvableErrors.asSequence().map { err ->
                        formatResolvableValidationError(parameterName, err)
                    }
                }
        val crossParameterMessages =
            e.crossParameterValidationResults
                .asSequence()
                .map { err -> formatResolvableValidationError("method", err) }
        return (parameterMessages + crossParameterMessages)
            .sorted()
            .joinToString("\n")
    }

    private fun formatResolvableValidationError(
        parameterName: String,
        err: MessageSourceResolvable,
    ): String =
        when (err) {
            is FieldError -> "${err.field}-${err.code}-${err.defaultMessage}"
            else -> {
                val code =
                    err.codes
                        ?.firstOrNull { !it.contains('.') }
                        ?: err.codes
                            ?.firstOrNull()
                            ?.substringBefore('.')
                        ?: "Invalid"
                "$parameterName-$code-${err.defaultMessage}"
            }
        }

    private fun logMvcRequestRejected(
        ex: Exception,
        request: HttpServletRequest,
    ) {
        val method = sanitizeLogValue(request.method, MAX_METHOD_LENGTH)
        val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
        val reason = mvcRejectedReason(ex)
        logger.warn(
            "mvc_request_rejected method={} path={} exceptionClass={} reason={}",
            method,
            path,
            ex::class.qualifiedName,
            reason,
        )
    }

    private fun mvcRejectedReason(ex: Exception): String =
        when (ex) {
            is MethodArgumentTypeMismatchException -> {
                val parameterName = sanitizeLogValue(ex.name, MAX_METHOD_LENGTH)
                val requiredType = sanitizeLogValue(ex.requiredType?.simpleName, MAX_METHOD_LENGTH)
                "type_mismatch name=$parameterName requiredType=$requiredType"
            }
            else -> SensitiveQueryRedactor.redactText(ex.message, MAX_QUERY_LENGTH)
        }

    /**
     * Logback은 스택 출력에 throwable의 className과 message를 넣는다.
     * 원본과 같은 런타임 타입의 복사본을 만들고, message/cause/suppressed 메시지만 마스킹한다.
     */
    private fun redactedThrowableForLogging(ex: Throwable): Throwable = redactedThrowableForLogging(ex, IdentityHashMap())

    private fun redactedThrowableForLogging(
        ex: Throwable,
        visited: IdentityHashMap<Throwable, Throwable>,
    ): Throwable {
        visited[ex]?.let { return it }

        val redactedMessage = redactedExceptionMessage(ex)
        // 순환 cause/suppressed 그래프에서 재귀가 끝나도록 임시 복사본을 먼저 등록한다.
        val provisional =
            createThrowableCopy(ex, redactedMessage, cause = null)
                ?: fallbackRedactedThrowable(ex, redactedMessage)
        visited[ex] = provisional

        val redactedCause = ex.cause?.let { redactedThrowableForLogging(it, visited) }
        val copy =
            if (redactedCause == null) {
                provisional
            } else {
                // CompletionException(String, Throwable)처럼 null cause도 생성 시 고정되면
                // 이후 initCause가 실패한다. 마스킹된 cause로 다시 생성한다.
                recreateWithCauseIfNeeded(ex, redactedMessage, provisional, redactedCause)
            }
        visited[ex] = copy
        copy.stackTrace = ex.stackTrace

        for (suppressed in ex.suppressed) {
            copy.addSuppressed(redactedThrowableForLogging(suppressed, visited))
        }
        return copy
    }

    private fun redactedExceptionMessage(ex: Throwable): String =
        if (ex is AppException) {
            "${ex.rsData.resultCode} : ${SensitiveQueryRedactor.redactText(ex.rsData.msg, MAX_QUERY_LENGTH)}"
        } else {
            SensitiveQueryRedactor.redactText(ex.message, MAX_QUERY_LENGTH)
        }

    private fun recreateWithCauseIfNeeded(
        ex: Throwable,
        redactedMessage: String,
        provisional: Throwable,
        redactedCause: Throwable,
    ): Throwable {
        if (attachCause(provisional, redactedCause)) {
            return provisional
        }
        return createThrowableCopy(ex, redactedMessage, redactedCause)
            ?: provisional.also {
                // 마지막 수단: 로깅 자체가 깨지지 않도록 임시 복사본을 유지한다(cause가 없을 수 있음).
            }
    }

    private fun createThrowableCopy(
        ex: Throwable,
        redactedMessage: String,
        cause: Throwable?,
    ): Throwable? {
        if (ex is AppException) {
            return AppException(
                ex.rsData.resultCode,
                SensitiveQueryRedactor.redactText(ex.rsData.msg, MAX_QUERY_LENGTH),
            )
        }
        return createThrowableWithMessage(ex.javaClass, redactedMessage, cause)
    }

    private fun fallbackRedactedThrowable(
        ex: Throwable,
        redactedMessage: String,
    ): Throwable =
        if (ex is RuntimeException) {
            RuntimeException(redactedMessage)
        } else {
            Exception(redactedMessage)
        }

    private fun createThrowableWithMessage(
        clazz: Class<out Throwable>,
        message: String,
        cause: Throwable?,
    ): Throwable? {
        // public (String) 생성자를 우선한다. cause가 비어 있어야 이후 initCause로 붙일 수 있다.
        runCatching {
            return clazz.getConstructor(String::class.java).newInstance(message)
        }

        // cause가 있으면 (String, Throwable)에 마스킹된 cause를 바로 넣어 생성한다.
        if (cause != null) {
            runCatching {
                val instance =
                    clazz
                        .getConstructor(String::class.java, Throwable::class.java)
                        .newInstance(message, cause)
                if (instance.message == message) return instance
            }
            runCatching {
                val instance = clazz.getConstructor(Throwable::class.java).newInstance(cause)
                if (instance.message == message || instance.cause === cause) return instance
            }
        }

        // 그 외 public 생성자 (예: DateTimeParseException(String, CharSequence, int)).
        for (ctor in clazz.constructors.sortedBy { it.parameterCount }) {
            val instance =
                runCatching {
                    val args =
                        Array(ctor.parameterCount) { index ->
                            defaultThrowableCtorArg(ctor.parameterTypes[index], message, cause)
                        }
                    ctor.newInstance(*args) as Throwable
                }.getOrNull() ?: continue

            // private 필드 수정 없이, message가 이미 마스킹된 복사본만 사용한다.
            if (instance.message != message) continue
            // cause가 필요한데 이 생성자가 cause를 비웠거나 다른 값이면 다음 생성자를 본다.
            if (cause != null && instance.cause !== cause && instance.cause != null) continue
            if (cause != null && instance.cause == null) continue
            return instance
        }
        return null
    }

    private fun defaultThrowableCtorArg(
        type: Class<*>,
        message: String,
        cause: Throwable?,
    ): Any? =
        when {
            type == String::class.java || type == CharSequence::class.java -> message
            type == Throwable::class.java -> cause
            type == Integer.TYPE || type == Integer::class.java -> 0
            type == java.lang.Long.TYPE || type == java.lang.Long::class.java -> 0L
            type == java.lang.Boolean.TYPE || type == java.lang.Boolean::class.java -> false
            type.isEnum -> type.enumConstants.firstOrNull()
            else -> null
        }

    private fun attachCause(
        target: Throwable,
        cause: Throwable,
    ): Boolean =
        try {
            target.initCause(cause)
            true
        } catch (_: IllegalStateException) {
            false
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
        private val LOG_CONTROL_CHAR_REGEX = Regex("[\\x00-\\x1F\\x7F]")
    }
}
