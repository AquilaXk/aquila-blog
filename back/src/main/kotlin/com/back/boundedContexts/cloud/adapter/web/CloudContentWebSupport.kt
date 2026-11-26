package com.back.boundedContexts.cloud.adapter.web

import com.back.boundedContexts.cloud.application.service.CloudFileContent
import com.back.boundedContexts.cloud.application.service.CloudFileDto
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.metrics.CloudMediaMetrics
import io.micrometer.core.instrument.MeterRegistry
import jakarta.servlet.http.HttpServletRequest
import org.springframework.core.io.InputStreamResource
import org.springframework.core.io.Resource
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpRange
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import java.nio.charset.StandardCharsets
import java.util.Locale

object CloudContentWebSupport {
    private const val SANDBOX_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

    private val ACTIVE_SCRIPT_CONTENT_TYPES =
        setOf(
            "image/svg+xml",
            "text/html",
            "application/xhtml+xml",
            "text/xml",
            "application/xml",
            "text/javascript",
            "application/javascript",
        )

    fun headMetadataResponse(file: CloudFileDto): ResponseEntity<Void> = headMetadataResponse(file, thumbnail = false)

    fun headMetadataResponse(
        file: CloudFileDto,
        thumbnail: Boolean,
    ): ResponseEntity<Void> {
        val builder =
            ResponseEntity
                .ok()
                .contentType(safeMediaType(file.contentType))
        if (!thumbnail) {
            builder
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .contentLength(file.byteSize)
        }
        applySecurityHeaders(builder, file.contentType)
        applyCacheHeaders(builder, file, thumbnail = thumbnail)
        return builder.build()
    }

    fun contentResponse(
        request: HttpServletRequest,
        meterRegistry: MeterRegistry?,
        endpoint: String,
        loadFile: () -> CloudFileDto,
        openRange: (CloudFileDto, LongRange) -> CloudFileContent,
        openFull: () -> CloudFileContent,
    ): ResponseEntity<Resource> =
        contentResponse(
            request = request,
            meterRegistry = meterRegistry,
            endpoint = endpoint,
            download = false,
            thumbnail = false,
            loadFile = loadFile,
            openRange = openRange,
            openFull = openFull,
        )

    fun contentResponse(
        request: HttpServletRequest,
        meterRegistry: MeterRegistry?,
        endpoint: String,
        download: Boolean,
        thumbnail: Boolean = false,
        loadFile: () -> CloudFileDto,
        openRange: (CloudFileDto, LongRange) -> CloudFileContent,
        openFull: () -> CloudFileContent,
    ): ResponseEntity<Resource> {
        val rangeHeader = if (thumbnail) null else request.getHeader(HttpHeaders.RANGE)

        return try {
            // 동영상 seek 호환을 위해 단일 byte range만 허용하고 multi-range는 거절한다.
            if (!rangeHeader.isNullOrBlank()) {
                val file = loadFile()
                val totalLength = file.byteSize
                val range = parseSingleRange(rangeHeader, totalLength)
                if (range == null) {
                    CloudMediaMetrics.recordPlaybackRequest(
                        meterRegistry,
                        statusClass = "4xx",
                        range = "partial",
                        endpoint = endpoint,
                    )
                    return noStoreHeaders(
                        ResponseEntity
                            .status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                            .header(HttpHeaders.CONTENT_RANGE, "bytes */$totalLength"),
                    ).build()
                }
                val content = openRange(file, range)
                val storedObject = content.storedObject
                try {
                    val bytesSent = range.last - range.first + 1
                    CloudMediaMetrics.recordPlaybackRequest(
                        meterRegistry,
                        statusClass = "2xx",
                        range = "partial",
                        endpoint = endpoint,
                        bytesSent = bytesSent,
                    )

                    val responseBuilder =
                        noStoreHeaders(
                            ResponseEntity
                                .status(HttpStatus.PARTIAL_CONTENT)
                                .contentType(safeMediaType(storedObject.contentType))
                                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                                .header(HttpHeaders.CONTENT_RANGE, "bytes ${range.first}-${range.last}/$totalLength")
                                .header(
                                    HttpHeaders.CONTENT_DISPOSITION,
                                    resolveDisposition(storedObject.contentType, content.file.originalFilename, download),
                                ).contentLength(bytesSent),
                        )
                    applySecurityHeaders(responseBuilder, storedObject.contentType)
                    return responseBuilder.body(InputStreamResource(storedObject.inputStream))
                } catch (ex: Throwable) {
                    runCatching { storedObject.inputStream.close() }
                    throw ex
                }
            }

            resolveMatchedEtag(request, loadFile, thumbnail)?.let { etag ->
                val notModifiedBuilder =
                    ResponseEntity
                        .status(HttpStatus.NOT_MODIFIED)
                        .header("X-Content-Type-Options", "nosniff")
                        .header(HttpHeaders.CACHE_CONTROL, "private, max-age=0, must-revalidate")
                        .header(HttpHeaders.ETAG, etag)
                CloudMediaMetrics.recordPlaybackRequest(
                    meterRegistry,
                    statusClass = "3xx",
                    range = "full",
                    endpoint = endpoint,
                )
                return notModifiedBuilder.build()
            }

            val content = openFull()
            val storedObject = content.storedObject
            try {
                val totalLength = storedObject.contentLength ?: -1L
                CloudMediaMetrics.recordPlaybackRequest(
                    meterRegistry,
                    statusClass = "2xx",
                    range = "full",
                    endpoint = endpoint,
                    bytesSent = totalLength.coerceAtLeast(0L),
                )
                val responseBuilder =
                    ResponseEntity
                        .ok()
                        .contentType(safeMediaType(storedObject.contentType))
                        .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            resolveDisposition(storedObject.contentType, content.file.originalFilename, download),
                        )
                if (!thumbnail) {
                    responseBuilder.header(HttpHeaders.ACCEPT_RANGES, "bytes")
                }
                applySecurityHeaders(responseBuilder, storedObject.contentType)
                applyCacheHeaders(responseBuilder, content.file, thumbnail = thumbnail)
                if (totalLength >= 0L) {
                    responseBuilder.contentLength(totalLength)
                }

                responseBuilder.body(InputStreamResource(storedObject.inputStream))
            } catch (ex: Throwable) {
                runCatching { storedObject.inputStream.close() }
                throw ex
            }
        } catch (ex: AppException) {
            val statusClass =
                when {
                    ex.rsData.resultCode.startsWith("5") -> "5xx"
                    ex.rsData.resultCode.startsWith("4") -> "4xx"
                    else -> "other"
                }
            CloudMediaMetrics.recordPlaybackRequest(
                meterRegistry,
                statusClass = statusClass,
                range = if (rangeHeader.isNullOrBlank()) "full" else "partial",
                endpoint = endpoint,
            )
            throw ex
        } catch (ex: RuntimeException) {
            CloudMediaMetrics.recordPlaybackRequest(
                meterRegistry,
                statusClass = "5xx",
                range = if (rangeHeader.isNullOrBlank()) "full" else "partial",
                endpoint = endpoint,
            )
            throw ex
        }
    }

    fun inlineDisposition(filename: String): String =
        ContentDisposition
            .inline()
            .filename(filename, StandardCharsets.UTF_8)
            .build()
            .toString()

    fun attachmentDisposition(filename: String): String =
        ContentDisposition
            .attachment()
            .filename(filename, StandardCharsets.UTF_8)
            .build()
            .toString()

    private fun resolveDisposition(
        contentType: String,
        filename: String,
        download: Boolean,
    ): String {
        val forceAttachment = download || isActiveScriptContentType(contentType)
        return if (forceAttachment) attachmentDisposition(filename) else inlineDisposition(filename)
    }

    private fun isActiveScriptContentType(contentType: String): Boolean {
        val normalized = contentType.substringBefore(';').trim().lowercase(Locale.ROOT)
        return normalized in ACTIVE_SCRIPT_CONTENT_TYPES
    }

    private fun <T : ResponseEntity.BodyBuilder> applySecurityHeaders(
        builder: T,
        contentType: String,
    ): T {
        builder.headers { it.set("X-Content-Type-Options", "nosniff") }
        if (isActiveScriptContentType(contentType)) {
            builder.headers { it.set("Content-Security-Policy", SANDBOX_CSP) }
        }
        return builder
    }

    internal fun resolveEtag(
        file: CloudFileDto,
        thumbnail: Boolean,
    ): String? {
        val checksum = file.checksumSha256?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return if (thumbnail) "\"$checksum-thumb\"" else "\"$checksum\""
    }

    private fun <T : ResponseEntity.BodyBuilder> applyCacheHeaders(
        builder: T,
        file: CloudFileDto,
        thumbnail: Boolean,
    ): T {
        val etag = resolveEtag(file, thumbnail)
        if (etag == null) {
            return noStoreHeaders(builder)
        }
        builder.header(HttpHeaders.CACHE_CONTROL, "private, max-age=0, must-revalidate")
        builder.header(HttpHeaders.ETAG, etag)
        builder.headers { it.set("X-Content-Type-Options", "nosniff") }
        return builder
    }

    private fun resolveMatchedEtag(
        request: HttpServletRequest,
        loadFile: () -> CloudFileDto,
        thumbnail: Boolean,
    ): String? {
        val headerValues = request.getHeaders(HttpHeaders.IF_NONE_MATCH)?.toList().orEmpty()
        if (headerValues.isEmpty()) return null
        val etag = resolveEtag(loadFile(), thumbnail) ?: return null
        val normalizedTarget = normalizeEtagToken(etag)
        val matched =
            headerValues.any { raw ->
                raw
                    .split(',')
                    .asSequence()
                    .map { it.trim() }
                    .any { token ->
                        token == "*" || normalizeEtagToken(token) == normalizedTarget
                    }
            }
        return if (matched) etag else null
    }

    private fun normalizeEtagToken(token: String): String =
        token
            .removePrefix("W/")
            .removePrefix("w/")
            .trim()

    fun safeMediaType(contentType: String): MediaType =
        runCatching { MediaType.parseMediaType(contentType) }
            .getOrElse { throw AppException(ErrorCode.INTERNAL_ERROR, "클라우드 파일 콘텐츠 타입이 올바르지 않습니다.") }

    fun <T : ResponseEntity.BodyBuilder> noStoreHeaders(builder: T): T {
        builder.header(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0")
        builder.header(HttpHeaders.PRAGMA, "no-cache")
        builder.header(HttpHeaders.EXPIRES, "0")
        builder.headers { it.set("X-Content-Type-Options", "nosniff") }
        return builder
    }

    fun parseSingleRange(
        rangeHeader: String,
        totalLength: Long,
    ): LongRange? {
        if (!rangeHeader.startsWith("bytes=") || totalLength <= 0L) return null
        return runCatching {
            val ranges = HttpRange.parseRanges(rangeHeader)
            if (ranges.size != 1) return null
            val range = ranges[0]
            val start = range.getRangeStart(totalLength)
            val end = range.getRangeEnd(totalLength)
            if (start in 0..end && end < totalLength) {
                start..end
            } else {
                null
            }
        }.getOrNull()
    }
}
