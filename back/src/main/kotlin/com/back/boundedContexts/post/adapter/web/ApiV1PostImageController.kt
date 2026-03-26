package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.storage.domain.UploadedFilePurpose
import jakarta.servlet.http.HttpServletRequest
import org.springframework.core.io.InputStreamResource
import org.springframework.core.io.Resource
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.io.EOFException
import java.io.InputStream
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.concurrent.TimeUnit

/**
 * ApiV1PostImageController는 웹 계층에서 HTTP 요청/응답을 처리하는 클래스입니다.
 * 입력 DTO 검증과 응답 포맷팅을 담당하고 비즈니스 처리는 애플리케이션 계층에 위임합니다.
 */
@RestController
@RequestMapping("/post/api/v1")
class ApiV1PostImageController(
    private val postImageStorageService: PostImageStoragePort,
    private val postImageStorageProperties: PostImageStorageProperties,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
) {
    companion object {
        private const val POST_IMAGE_MAX_FILE_SIZE_BYTES = 8L * 1024 * 1024
    }

    data class UploadPostImageResBody(
        val key: String,
        val url: String,
        val markdown: String,
    )

    /**
     * uploadPostImage 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    @PostMapping("/posts/images", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun uploadPostImage(
        @RequestPart("file") file: MultipartFile,
    ): RsData<UploadPostImageResBody> {
        if (file.isEmpty) {
            throw AppException("400-1", "이미지 파일이 비어 있습니다.")
        }
        val maxAllowedBytes = minOf(POST_IMAGE_MAX_FILE_SIZE_BYTES, postImageStorageProperties.maxFileSizeBytes)
        if (file.size > maxAllowedBytes) {
            val limitMb = (maxAllowedBytes + (1024 * 1024) - 1) / (1024 * 1024)
            throw AppException("413-1", "이미지 파일은 ${limitMb}MB 이하여야 합니다.")
        }

        val uploadRequest =
            PostImageStoragePort.UploadImageRequest(
                bytes = file.bytes,
                contentType = file.contentType,
                originalFilename = file.originalFilename,
            )
        val key = postImageStorageService.uploadPostImage(uploadRequest)
        uploadedFileRetentionService.registerTempUpload(
            objectKey = key,
            contentType = file.contentType.orEmpty(),
            fileSize = file.size,
            purpose = UploadedFilePurpose.POST_IMAGE,
        )
        val encodedKey =
            URLEncoder
                .encode(key, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("%2F", "/")
        val imageUrl = "${AppConfig.siteBackUrl}/post/api/v1/images/$encodedKey"

        return RsData(
            "201-1",
            "이미지가 업로드되었습니다.",
            UploadPostImageResBody(
                key = key,
                url = imageUrl,
                markdown = "![]($imageUrl)",
            ),
        )
    }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    @GetMapping("/images/**")
    @Transactional(readOnly = true)
    fun getPostImage(request: HttpServletRequest): ResponseEntity<Resource> {
        val objectKey = extractObjectKey(request)
        val etag =
            "\"" +
                Base64
                    .getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(objectKey.toByteArray(StandardCharsets.UTF_8)) +
                "\""
        if (isNotModified(request.getHeader(HttpHeaders.IF_NONE_MATCH), etag)) {
            return ResponseEntity
                .status(HttpStatus.NOT_MODIFIED)
                .eTag(etag)
                .cacheControl(
                    CacheControl
                        .maxAge(30, TimeUnit.DAYS)
                        .cachePublic()
                        .immutable(),
                ).build()
        }

        val image =
            postImageStorageService.getPostImage(objectKey)
                ?: throw AppException("404-1", "이미지를 찾을 수 없습니다.")

        val rangeHeader = request.getHeader(HttpHeaders.RANGE)
        if (!rangeHeader.isNullOrBlank()) {
            val totalLength = image.contentLength ?: -1
            if (totalLength <= 0) {
                image.inputStream.close()
                return ResponseEntity
                    .status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    .header(HttpHeaders.CONTENT_RANGE, "bytes */*")
                    .eTag(etag)
                    .cacheControl(
                        CacheControl
                            .maxAge(30, TimeUnit.DAYS)
                            .cachePublic()
                            .immutable(),
                    ).build()
            }
            val range = parseSingleRange(rangeHeader, totalLength)
            if (range == null) {
                image.inputStream.close()
                return ResponseEntity
                    .status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    .header(HttpHeaders.CONTENT_RANGE, "bytes */$totalLength")
                    .eTag(etag)
                    .cacheControl(
                        CacheControl
                            .maxAge(30, TimeUnit.DAYS)
                            .cachePublic()
                            .immutable(),
                    ).build()
            }

            val body = InputStreamResource(sliceStream(image.inputStream, range))

            return ResponseEntity
                .status(HttpStatus.PARTIAL_CONTENT)
                .contentType(MediaType.parseMediaType(image.contentType))
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .header(HttpHeaders.CONTENT_RANGE, "bytes ${range.first}-${range.last}/$totalLength")
                .contentLength(range.last - range.first + 1)
                .eTag(etag)
                .cacheControl(
                    CacheControl
                        .maxAge(30, TimeUnit.DAYS)
                        .cachePublic()
                        .immutable(),
                ).body(body)
        }

        val responseBuilder =
            ResponseEntity
                .ok()
                .contentType(MediaType.parseMediaType(image.contentType))
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .eTag(etag)
                .cacheControl(
                    CacheControl
                        .maxAge(30, TimeUnit.DAYS)
                        .cachePublic()
                        .immutable(),
                )

        val finalizedBuilder =
            image.contentLength
                ?.takeIf { it >= 0 }
                ?.let(responseBuilder::contentLength)
                ?: responseBuilder

        return finalizedBuilder.body(InputStreamResource(image.inputStream))
    }

    /**
     * 원본 입력에서 필요한 값을 안전하게 추출합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    private fun extractObjectKey(request: HttpServletRequest): String {
        val prefix = "/post/api/v1/images/"
        val path = request.requestURI
        if (!path.startsWith(prefix)) throw AppException("400-1", "잘못된 이미지 경로입니다.")

        val encodedKey = path.removePrefix(prefix).trim()
        if (encodedKey.isBlank()) throw AppException("404-1", "이미지를 찾을 수 없습니다.")
        return URLDecoder.decode(encodedKey, StandardCharsets.UTF_8)
    }

    /**
     * 검증 규칙을 적용해 허용 여부를 판정합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    private fun isNotModified(
        ifNoneMatch: String?,
        currentEtag: String,
    ): Boolean {
        if (ifNoneMatch.isNullOrBlank()) return false
        return ifNoneMatch
            .split(",")
            .map { it.trim() }
            .any { it == "*" || it == currentEtag }
    }

    /**
     * 원본 입력에서 필요한 값을 안전하게 추출합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    private fun parseSingleRange(
        rangeHeader: String,
        totalLength: Long,
    ): LongRange? {
        if (!rangeHeader.startsWith("bytes=")) return null
        if (totalLength <= 0) return null

        val spec = rangeHeader.removePrefix("bytes=").trim()
        if (spec.contains(",")) return null

        val (rawStart, rawEnd) =
            spec.split("-", limit = 2).let {
                if (it.size != 2) return null
                it[0].trim() to it[1].trim()
            }

        if (rawStart.isEmpty()) {
            val suffixLength = rawEnd.toLongOrNull() ?: return null
            if (suffixLength <= 0) return null
            val actualLength = minOf(suffixLength, totalLength)
            val start = totalLength - actualLength
            return start..(totalLength - 1)
        }

        val start = rawStart.toLongOrNull() ?: return null
        if (start < 0 || start >= totalLength) return null

        val end =
            if (rawEnd.isEmpty()) {
                totalLength - 1
            } else {
                val parsedEnd = rawEnd.toLongOrNull() ?: return null
                if (parsedEnd < start) return null
                minOf(parsedEnd, totalLength - 1)
            }

        return start..end
    }

    /**
     * skipFully 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    private fun skipFully(
        input: InputStream,
        count: Long,
    ) {
        var remaining = count
        while (remaining > 0) {
            val skipped = input.skip(remaining)
            if (skipped > 0) {
                remaining -= skipped
                continue
            }

            if (input.read() == -1) {
                throw EOFException("Unexpected EOF while skipping stream")
            }
            remaining -= 1
        }
    }

    /**
     * sliceStream 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    private fun sliceStream(
        source: InputStream,
        range: LongRange,
    ): InputStream {
        skipFully(source, range.first)
        return object : InputStream() {
            private var remaining = range.last - range.first + 1

            /**
             * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
             * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
             */
            override fun read(): Int {
                if (remaining <= 0) return -1
                val value = source.read()
                if (value >= 0) remaining -= 1
                return value
            }

            /**
             * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
             * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
             */
            override fun read(
                b: ByteArray,
                off: Int,
                len: Int,
            ): Int {
                if (remaining <= 0) return -1
                val allowed = minOf(remaining, len.toLong()).toInt()
                val read = source.read(b, off, allowed)
                if (read > 0) remaining -= read.toLong()
                return read
            }

            override fun close() {
                source.close()
            }
        }
    }
}
