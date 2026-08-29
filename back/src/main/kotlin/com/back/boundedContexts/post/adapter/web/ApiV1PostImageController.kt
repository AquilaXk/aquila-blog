package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.rsData.RsData
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.domain.UploadedFileOwnerType
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileStatus
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

@RestController
@RequestMapping("/post/api/v1")
class ApiV1PostImageController(
    private val postImageStorageService: PostImageStoragePort,
    private val postImageStorageProperties: PostImageStorageProperties,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
    private val uploadedFileRepository: UploadedFileRepositoryPort,
    private val postRepository: PostRepositoryPort,
) {
    companion object {
        private const val POST_IMAGE_MAX_FILE_SIZE_BYTES = 8L * 1024 * 1024
    }

    data class UploadPostImageResBody(
        val key: String,
        val url: String,
        val markdown: String,
    )

    @PostMapping("/posts/images", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun uploadPostImage(
        @RequestPart("file") file: MultipartFile,
    ): RsData<UploadPostImageResBody> {
        if (file.isEmpty) {
            throw AppException(ErrorCode.BAD_REQUEST, "이미지 파일이 비어 있습니다.")
        }
        val maxAllowedBytes = minOf(POST_IMAGE_MAX_FILE_SIZE_BYTES, postImageStorageProperties.maxFileSizeBytes)
        if (file.size > maxAllowedBytes) {
            val limitMb = (maxAllowedBytes + (1024 * 1024) - 1) / (1024 * 1024)
            throw AppException(ErrorCode.PAYLOAD_TOO_LARGE, "이미지 파일은 ${limitMb}MB 이하여야 합니다.")
        }

        val uploadRequest =
            PostImageStoragePort.UploadImageRequest(
                inputStream = file.inputStream,
                contentLength = file.size,
                contentType = file.contentType,
                originalFilename = file.originalFilename,
            )
        val key = postImageStorageService.uploadPostImage(uploadRequest)
        uploadedFileRetentionService.registerTempUploadWithCompensation(
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
        val objectKey =
            extractObjectKey(
                request,
                "/post/api/v1/images/",
                "잘못된 이미지 경로입니다.",
                "이미지를 찾을 수 없습니다.",
            )
        ensurePublicPostUpload(
            objectKey = objectKey,
            purpose = UploadedFilePurpose.POST_IMAGE,
            notFound = ::postImageNotFound,
        )
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
                .cacheControl(imageCacheControl())
                .build()
        }

        val image =
            postImageStorageService.getPostImage(objectKey)
                ?: throw AppException(ErrorCode.NOT_FOUND, "이미지를 찾을 수 없습니다.")

        val rangeHeader = request.getHeader(HttpHeaders.RANGE)
        if (!rangeHeader.isNullOrBlank()) {
            val totalLength = image.contentLength ?: -1
            if (totalLength <= 0) {
                image.inputStream.close()
                return ResponseEntity
                    .status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    .header(HttpHeaders.CONTENT_RANGE, "bytes */*")
                    .eTag(etag)
                    .cacheControl(imageCacheControl())
                    .build()
            }
            val range = parseSingleRange(rangeHeader, totalLength)
            if (range == null) {
                image.inputStream.close()
                return ResponseEntity
                    .status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    .header(HttpHeaders.CONTENT_RANGE, "bytes */$totalLength")
                    .eTag(etag)
                    .cacheControl(imageCacheControl())
                    .build()
            }

            val body = InputStreamResource(sliceStream(image.inputStream, range))

            return ResponseEntity
                .status(HttpStatus.PARTIAL_CONTENT)
                .contentType(MediaType.parseMediaType(image.contentType))
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .header(HttpHeaders.CONTENT_RANGE, "bytes ${range.first}-${range.last}/$totalLength")
                .contentLength(range.last - range.first + 1)
                .eTag(etag)
                .cacheControl(imageCacheControl())
                .body(body)
        }

        val responseBuilder =
            ResponseEntity
                .ok()
                .contentType(MediaType.parseMediaType(image.contentType))
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .eTag(etag)
                .cacheControl(imageCacheControl())

        val finalizedBuilder =
            image.contentLength
                ?.takeIf { it >= 0 }
                ?.let(responseBuilder::contentLength)
                ?: responseBuilder

        return finalizedBuilder.body(InputStreamResource(image.inputStream))
    }

    private fun ensurePublicPostUpload(
        objectKey: String,
        purpose: UploadedFilePurpose,
        notFound: () -> AppException,
    ) {
        val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey) ?: throw notFound()
        if (
            uploadedFile.purpose != purpose ||
            uploadedFile.status != UploadedFileStatus.ACTIVE ||
            uploadedFile.ownerType != UploadedFileOwnerType.POST
        ) {
            throw notFound()
        }

        val postId = uploadedFile.ownerId?.takeIf { it > 0L } ?: throw notFound()
        if (postRepository.findPublicDetailById(postId) == null) throw notFound()
    }

    private fun postImageNotFound(): AppException = AppException(ErrorCode.NOT_FOUND, "이미지를 찾을 수 없습니다.")

    private fun imageCacheControl(): CacheControl = CacheControl.noCache().cachePublic()

    private fun extractObjectKey(
        request: HttpServletRequest,
        prefix: String,
        invalidPathMessage: String,
        notFoundMessage: String,
    ): String {
        val path = request.requestURI
        if (!path.startsWith(prefix)) throw AppException(ErrorCode.BAD_REQUEST, invalidPathMessage)

        val encodedKey = path.removePrefix(prefix).trim()
        if (encodedKey.isBlank()) throw AppException(ErrorCode.NOT_FOUND, notFoundMessage)
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

    private fun sliceStream(
        source: InputStream,
        range: LongRange,
    ): InputStream {
        skipFully(source, range.first)
        return object : InputStream() {
            private var remaining = range.last - range.first + 1

            override fun read(): Int {
                if (remaining <= 0) return -1
                val value = source.read()
                if (value >= 0) remaining -= 1
                return value
            }

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
