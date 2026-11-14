package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.application.port.input.ProfileImageReadUseCase
import com.back.boundedContexts.post.application.port.input.PostImageReadAccessUseCase
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.application.support.PostCacheTags
import com.back.boundedContexts.post.dto.PostImageReadPlanDto
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.ImageUploadAdmissionValidator
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.storage.application.UploadedFileUrlCodec
import com.back.global.storage.config.StoragePropertiesPort
import com.back.global.storage.domain.UploadedFilePurpose
import jakarta.servlet.http.HttpServletRequest
import org.springframework.core.io.InputStreamResource
import org.springframework.core.io.Resource
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.io.EOFException
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.concurrent.TimeUnit

@RestController
@RequestMapping("/post/api/v1")
class ApiV1PostImageController(
    private val postImageStorageService: PostImageStoragePort,
    private val storageProperties: StoragePropertiesPort,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
    private val postImageReadAccessUseCase: PostImageReadAccessUseCase,
) {
    companion object {
        private const val POST_IMAGE_MAX_FILE_SIZE_BYTES = 8L * 1024 * 1024
        private const val IMAGE_NOT_FOUND_MESSAGE = "이미지를 찾을 수 없습니다."
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
        val maxAllowedBytes = minOf(POST_IMAGE_MAX_FILE_SIZE_BYTES, storageProperties.maxFileSizeBytes)
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
        val imageUrl = UploadedFileUrlCodec.buildImageUrl(key)

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
    fun getPostImage(
        request: HttpServletRequest,
        @AuthenticationPrincipal securityUser: SecurityUser? = null,
    ): ResponseEntity<Resource> {
        val objectKey =
            extractObjectKey(
                request,
                "/post/api/v1/images/",
                "잘못된 이미지 경로입니다.",
                IMAGE_NOT_FOUND_MESSAGE,
            )
        val readPlan =
            postImageReadAccessUseCase.resolveReadPlan(
                objectKey = objectKey,
                viewerId = securityUser?.id,
                isAdmin = isAdminUser(securityUser),
            )
        val etag =
            "\"" +
                Base64
                    .getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(objectKey.toByteArray(StandardCharsets.UTF_8)) +
                "\""
        if (isNotModified(request.getHeader(HttpHeaders.IF_NONE_MATCH), etag)) {
            return withImageCacheControl(
                ResponseEntity
                    .status(HttpStatus.NOT_MODIFIED)
                    .eTag(etag),
                readPlan,
                objectKey,
            ).build()
        }

        val rangeHeader = request.getHeader(HttpHeaders.RANGE)
        val requestedClosedRange =
            if (!rangeHeader.isNullOrBlank()) parseClosedRangeSyntax(rangeHeader) else null
        val image =
            if (requestedClosedRange != null) {
                postImageStorageService.getPostImage(objectKey, requestedClosedRange)
            } else {
                postImageStorageService.getPostImage(objectKey)
            } ?: throw AppException(ErrorCode.NOT_FOUND, IMAGE_NOT_FOUND_MESSAGE)

        if (!rangeHeader.isNullOrBlank() && image.rangeUnsatisfiable) {
            closeStreamQuietly(image.inputStream)
            val totalSuffix = image.totalContentLength?.takeIf { it > 0 }?.toString() ?: "*"
            return withImageCacheControl(
                ResponseEntity
                    .status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    .header(HttpHeaders.CONTENT_RANGE, "bytes */$totalSuffix")
                    .eTag(etag),
                readPlan,
                objectKey,
            ).build()
        }

        val canonicalMimeType = resolveSafeImageMimeType(image.contentType)
        if (canonicalMimeType == null) {
            closeStreamQuietly(image.inputStream)
            throw AppException(ErrorCode.BAD_REQUEST, "지원하지 않는 이미지 형식입니다.")
        }

        if (!rangeHeader.isNullOrBlank()) {
            if (image.isPartialContent && requestedClosedRange != null) {
                val resolvedStart = image.partialStart ?: requestedClosedRange.first
                val resolvedEnd = image.partialEnd ?: requestedClosedRange.last
                val totalLength = image.totalContentLength ?: (resolvedEnd + 1)
                val clampedEnd = minOf(resolvedEnd, totalLength - 1)
                val sliceLength = (image.contentLength ?: (clampedEnd - resolvedStart + 1)).coerceAtLeast(0L)
                return withImageCacheControl(
                    ResponseEntity
                        .status(HttpStatus.PARTIAL_CONTENT)
                        .contentType(MediaType.parseMediaType(canonicalMimeType))
                        .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                        .header(HttpHeaders.CONTENT_RANGE, "bytes $resolvedStart-$clampedEnd/$totalLength")
                        .contentLength(sliceLength)
                        .eTag(etag),
                    readPlan,
                    objectKey,
                ).body(InputStreamResource(image.inputStream))
            }

            val totalLength = image.totalContentLength ?: image.contentLength ?: -1
            if (totalLength <= 0) {
                image.inputStream.close()
                return withImageCacheControl(
                    ResponseEntity
                        .status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */*")
                        .eTag(etag),
                    readPlan,
                    objectKey,
                ).build()
            }
            val range = parseSingleRange(rangeHeader, totalLength)
            if (range == null) {
                image.inputStream.close()
                return withImageCacheControl(
                    ResponseEntity
                        .status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */$totalLength")
                        .eTag(etag),
                    readPlan,
                    objectKey,
                ).build()
            }

            val body = InputStreamResource(sliceStream(image.inputStream, range))

            return withImageCacheControl(
                ResponseEntity
                    .status(HttpStatus.PARTIAL_CONTENT)
                    .contentType(MediaType.parseMediaType(canonicalMimeType))
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .header(HttpHeaders.CONTENT_RANGE, "bytes ${range.first}-${range.last}/$totalLength")
                    .contentLength(range.last - range.first + 1)
                    .eTag(etag),
                readPlan,
                objectKey,
            ).body(body)
        }

        val responseBuilder =
            withImageCacheControl(
                ResponseEntity
                    .ok()
                    .contentType(MediaType.parseMediaType(canonicalMimeType))
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .eTag(etag),
                readPlan,
                objectKey,
            )

        val finalizedBuilder =
            image.contentLength
                ?.takeIf { it >= 0 }
                ?.let(responseBuilder::contentLength)
                ?: responseBuilder

        return finalizedBuilder.body(InputStreamResource(image.inputStream))
    }

    private fun isAdminUser(securityUser: SecurityUser?): Boolean = securityUser?.authorities?.any { it.authority == "ROLE_ADMIN" } == true

    private fun withImageCacheControl(
        builder: ResponseEntity.BodyBuilder,
        readPlan: PostImageReadPlanDto,
        objectKey: String,
    ): ResponseEntity.BodyBuilder {
        val securedBuilder =
            builder
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "default-src 'none'; sandbox")
        return if (readPlan.access == ProfileImageReadUseCase.Access.OWNER_ONLY) {
            securedBuilder
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header(HttpHeaders.VARY, HttpHeaders.COOKIE)
        } else if (readPlan.purpose == UploadedFilePurpose.POST_IMAGE) {
            val cacheTags =
                buildSet {
                    add(PostCacheTags.IMAGES)
                    add("post-image:$objectKey")
                    readPlan.ownerPostId?.let {
                        add(PostCacheTags.byPostId(it))
                        add("post:$it")
                    }
                    readPlan.referencingPostId?.let {
                        add(PostCacheTags.byPostId(it))
                        add("post:$it")
                    }
                }
            securedBuilder
                .cacheControl(
                    CacheControl
                        .maxAge(3600, TimeUnit.SECONDS)
                        .staleWhileRevalidate(86400, TimeUnit.SECONDS)
                        .cachePublic(),
                ).header("Surrogate-Key", cacheTags.joinToString(" "))
                .header("Cache-Tag", cacheTags.joinToString(","))
        } else {
            securedBuilder.cacheControl(
                CacheControl
                    .maxAge(3600, TimeUnit.SECONDS)
                    .staleWhileRevalidate(86400, TimeUnit.SECONDS)
                    .cachePublic(),
            )
        }
    }

    private fun resolveSafeImageMimeType(rawContentType: String?): String? {
        val canonical = ImageUploadAdmissionValidator.normalizeImageMediaContentType(rawContentType) ?: return null
        return canonical.takeIf { it in ImageUploadAdmissionValidator.ALLOWED_IMAGE_CONTENT_TYPES }
    }

    private fun parseClosedRangeSyntax(rangeHeader: String): LongRange? {
        if (!rangeHeader.startsWith("bytes=")) return null
        val spec = rangeHeader.removePrefix("bytes=").trim()
        if (spec.isEmpty() || spec.contains(",")) return null
        val dashIndex = spec.indexOf('-')
        if (dashIndex <= 0 || dashIndex >= spec.lastIndex) return null
        val start = spec.substring(0, dashIndex).trim().toLongOrNull() ?: return null
        val end = spec.substring(dashIndex + 1).trim().toLongOrNull() ?: return null
        if (start < 0 || end < start) return null
        return start..end
    }

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
        return decodeRfc3986PathSegment(encodedKey, invalidPathMessage)
    }

    private fun decodeRfc3986PathSegment(
        encoded: String,
        invalidPathMessage: String,
    ): String {
        val firstPercent = encoded.indexOf('%')
        if (firstPercent < 0) return encoded

        val len = encoded.length
        val out = StringBuilder(len)
        out.append(encoded, 0, firstPercent)
        val byteBuffer = ByteArray(len - firstPercent)
        val decoder =
            StandardCharsets.UTF_8
                .newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
        var i = firstPercent
        while (i < len) {
            val ch = encoded[i]
            if (ch != '%') {
                out.append(ch)
                i++
                continue
            }
            var byteCount = 0
            while (i < len && encoded[i] == '%') {
                if (i + 2 >= len) throw AppException(ErrorCode.BAD_REQUEST, invalidPathMessage)
                val hi = hexNibble(encoded[i + 1])
                val lo = hexNibble(encoded[i + 2])
                if (hi < 0 || lo < 0) throw AppException(ErrorCode.BAD_REQUEST, invalidPathMessage)
                byteBuffer[byteCount++] = ((hi shl 4) or lo).toByte()
                i += 3
            }
            try {
                out.append(decoder.decode(ByteBuffer.wrap(byteBuffer, 0, byteCount)))
            } catch (_: CharacterCodingException) {
                throw AppException(ErrorCode.BAD_REQUEST, invalidPathMessage)
            }
            decoder.reset()
        }
        return out.toString()
    }

    private fun hexNibble(ch: Char): Int =
        when (ch) {
            in '0'..'9' -> ch.code - '0'.code
            in 'a'..'f' -> ch.code - 'a'.code + 10
            in 'A'..'F' -> ch.code - 'A'.code + 10
            else -> -1
        }

    private fun isNotModified(
        ifNoneMatch: String?,
        currentEtag: String,
    ): Boolean {
        if (ifNoneMatch.isNullOrBlank()) return false
        var start = 0
        val length = ifNoneMatch.length
        while (start <= length) {
            val commaIndex = ifNoneMatch.indexOf(',', start)
            val end = if (commaIndex >= 0) commaIndex else length
            var left = start
            var right = end
            while (left < right && ifNoneMatch[left] <= ' ') left++
            while (right > left && ifNoneMatch[right - 1] <= ' ') right--
            if (left < right) {
                val tokenLength = right - left
                if (tokenLength == 1 && ifNoneMatch[left] == '*') return true
                val matchStart =
                    if (tokenLength >= 2 && ifNoneMatch[left] == 'W' && ifNoneMatch[left + 1] == '/') {
                        left + 2
                    } else {
                        left
                    }
                if (right - matchStart == currentEtag.length &&
                    ifNoneMatch.regionMatches(matchStart, currentEtag, 0, currentEtag.length)
                ) {
                    return true
                }
            }
            if (commaIndex < 0) break
            start = commaIndex + 1
        }
        return false
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

    private fun closeStreamQuietly(source: InputStream) {
        runCatching { source.close() }
    }

    private fun sliceStream(
        source: InputStream,
        range: LongRange,
    ): InputStream {
        try {
            skipFully(source, range.first)
        } catch (ex: Throwable) {
            closeStreamQuietly(source)
            throw ex
        }
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
