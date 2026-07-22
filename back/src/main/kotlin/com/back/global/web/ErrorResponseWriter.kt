package com.back.global.web

import com.back.global.exception.application.ErrorCode
import com.back.global.exception.application.ErrorKind
import com.back.global.observability.ErrorMetrics
import com.back.global.rsData.RsData
import com.back.global.web.logging.SensitiveQueryRedactor
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

/**
 * Filter/Security 경로의 RsData JSON 에러 응답·구조화 로그·메트릭을 한곳에서 처리한다.
 */
@Component
class ErrorResponseWriter(
    private val objectMapper: ObjectMapper,
    private val errorMetrics: ErrorMetrics,
) {
    private val logger = LoggerFactory.getLogger(ErrorResponseWriter::class.java)

    fun write(
        request: HttpServletRequest,
        response: HttpServletResponse,
        errorCode: ErrorCode,
        source: ErrorResponseSource,
        rsData: RsData<Void> = errorCode.toRsData(),
        retryAfterSeconds: Long? = null,
        cause: Throwable? = null,
    ) {
        if (response.isCommitted) {
            val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
            logger.warn(
                "error_response_committed path={} code={} source={}",
                path,
                errorCode.code,
                source.tag,
                cause,
            )
            return
        }

        response.status = rsData.statusCode
        response.contentType = CONTENT_TYPE
        response.characterEncoding = Charsets.UTF_8.name()
        if (retryAfterSeconds != null) {
            response.setHeader(HttpHeaders.RETRY_AFTER, retryAfterSeconds.toString())
        }
        response.writer.write(objectMapper.writeValueAsString(rsData))

        logStructured(request, errorCode, rsData, source, cause)
        errorMetrics.increment(
            code = errorCode.code,
            status = rsData.statusCode,
            source = source.tag,
        )
    }

    private fun logStructured(
        request: HttpServletRequest,
        errorCode: ErrorCode,
        rsData: RsData<Void>,
        source: ErrorResponseSource,
        cause: Throwable?,
    ) {
        val method = sanitizeLogValue(request.method, MAX_METHOD_LENGTH)
        val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
        val query = SensitiveQueryRedactor.redactQuery(request.queryString, MAX_QUERY_LENGTH)
        val exceptionMessage = SensitiveQueryRedactor.redactText(cause?.message ?: rsData.msg, MAX_QUERY_LENGTH)

        when (errorCode.kind) {
            ErrorKind.USER ->
                logger.warn(
                    "error_response status={} method={} path={} query={} resultCode={} kind={} source={} exceptionMessage={}",
                    rsData.statusCode,
                    method,
                    path,
                    query,
                    rsData.resultCode,
                    errorCode.kind,
                    source.tag,
                    exceptionMessage,
                )
            ErrorKind.DEVELOPER ->
                logger.error(
                    "error_response status={} method={} path={} query={} resultCode={} kind={} source={} exceptionClass={} exceptionMessage={}",
                    rsData.statusCode,
                    method,
                    path,
                    query,
                    rsData.resultCode,
                    errorCode.kind,
                    source.tag,
                    cause?.let { it::class.qualifiedName } ?: "-",
                    exceptionMessage,
                    cause,
                )
        }
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
        const val CONTENT_TYPE = "application/json;charset=UTF-8"
        private const val MAX_METHOD_LENGTH = 16
        private const val MAX_PATH_LENGTH = 512
        private const val MAX_QUERY_LENGTH = 512
        private val LOG_CONTROL_CHAR_REGEX = Regex("[\\x00-\\x1F\\x7F]")
    }
}
