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

object CloudContentWebSupport {
    fun headMetadataResponse(file: CloudFileDto): ResponseEntity<Void> =
        noStoreHeaders(
            ResponseEntity
                .ok()
                .contentType(safeMediaType(file.contentType))
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .contentLength(file.byteSize),
        ).build()

    fun contentResponse(
        request: HttpServletRequest,
        meterRegistry: MeterRegistry?,
        endpoint: String,
        loadFile: () -> CloudFileDto,
        openRange: (LongRange) -> CloudFileContent,
        openFull: () -> CloudFileContent,
    ): ResponseEntity<Resource> {
        val rangeHeader = request.getHeader(HttpHeaders.RANGE)

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
                val content = openRange(range)
                val storedObject = content.storedObject
                val bytesSent = range.last - range.first + 1
                CloudMediaMetrics.recordPlaybackRequest(
                    meterRegistry,
                    statusClass = "2xx",
                    range = "partial",
                    endpoint = endpoint,
                    bytesSent = bytesSent,
                )

                return noStoreHeaders(
                    ResponseEntity
                        .status(HttpStatus.PARTIAL_CONTENT)
                        .contentType(safeMediaType(storedObject.contentType))
                        .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                        .header(HttpHeaders.CONTENT_RANGE, "bytes ${range.first}-${range.last}/$totalLength")
                        .header(HttpHeaders.CONTENT_DISPOSITION, inlineDisposition(content.file.originalFilename))
                        .contentLength(bytesSent),
                ).body(InputStreamResource(storedObject.inputStream))
            }

            val content = openFull()
            val storedObject = content.storedObject
            val totalLength = storedObject.contentLength ?: -1L
            CloudMediaMetrics.recordPlaybackRequest(
                meterRegistry,
                statusClass = "2xx",
                range = "full",
                endpoint = endpoint,
                bytesSent = totalLength.coerceAtLeast(0L),
            )
            val responseBuilder =
                noStoreHeaders(
                    ResponseEntity
                        .ok()
                        .contentType(safeMediaType(storedObject.contentType))
                        .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                        .header(HttpHeaders.CONTENT_DISPOSITION, inlineDisposition(content.file.originalFilename)),
                )
            if (totalLength >= 0L) {
                responseBuilder.contentLength(totalLength)
            }

            responseBuilder.body(InputStreamResource(storedObject.inputStream))
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

    fun safeMediaType(contentType: String): MediaType =
        runCatching { MediaType.parseMediaType(contentType) }
            .getOrElse { throw AppException(ErrorCode.INTERNAL_ERROR, "클라우드 파일 콘텐츠 타입이 올바르지 않습니다.") }

    fun <T : ResponseEntity.BodyBuilder> noStoreHeaders(builder: T): T {
        builder.header(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0")
        builder.header(HttpHeaders.PRAGMA, "no-cache")
        builder.header(HttpHeaders.EXPIRES, "0")
        builder.header("X-Content-Type-Options", "nosniff")
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
