package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.storage.domain.UploadedFilePurpose
import jakarta.servlet.http.HttpServletRequest
import org.springframework.core.io.ByteArrayResource
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
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.concurrent.TimeUnit

@RestController
@RequestMapping("/post/api/v1")
class ApiV1PostImageController(
    private val postImageStorageService: PostImageStoragePort,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
) {
    data class UploadPostImageResBody(
        val key: String,
        val url: String,
        val markdown: String,
    )

    @PostMapping("/posts/images", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    @Transactional
    fun uploadPostImage(
        @RequestPart("file") file: MultipartFile,
    ): RsData<UploadPostImageResBody> {
        val key = postImageStorageService.uploadPostImage(file)
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
            val bytes = image.inputStream.use { it.readAllBytes() }
            val totalLength = bytes.size.toLong()
            val range = parseSingleRange(rangeHeader, totalLength)
            if (range == null) {
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

            val body =
                ByteArrayResource(
                    bytes.copyOfRange(range.first.toInt(), range.last.toInt() + 1),
                )

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

    private fun extractObjectKey(request: HttpServletRequest): String {
        val prefix = "/post/api/v1/images/"
        val path = request.requestURI
        if (!path.startsWith(prefix)) throw AppException("400-1", "잘못된 이미지 경로입니다.")

        val encodedKey = path.removePrefix(prefix).trim()
        if (encodedKey.isBlank()) throw AppException("404-1", "이미지를 찾을 수 없습니다.")
        return URLDecoder.decode(encodedKey, StandardCharsets.UTF_8)
    }

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
}
