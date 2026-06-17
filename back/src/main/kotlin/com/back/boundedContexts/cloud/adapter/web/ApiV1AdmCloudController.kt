package com.back.boundedContexts.cloud.adapter.web

import com.back.boundedContexts.cloud.application.service.CloudFileDto
import com.back.boundedContexts.cloud.application.service.CloudFileService
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadPartResultDto
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadSessionDto
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadSessionService
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import io.swagger.v3.oas.annotations.responses.ApiResponse
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.constraints.Positive
import org.springframework.core.io.InputStreamResource
import org.springframework.core.io.Resource
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.io.EOFException
import java.io.InputStream
import java.nio.charset.StandardCharsets

@Validated
@RestController
@RequestMapping("/system/api/v1/adm/cloud")
class ApiV1AdmCloudController(
    private val cloudFileService: CloudFileService,
    private val cloudVideoUploadSessionService: CloudVideoUploadSessionService,
) {
    data class CloudFileListResBody(
        val files: List<CloudFileDto>,
    )

    data class CreateVideoUploadSessionReqBody(
        val originalFilename: String?,
        val contentType: String?,
        val byteSize: Long?,
        val folderPath: String? = "",
    )

    @GetMapping("/files")
    @Transactional(readOnly = true)
    fun listFiles(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @RequestParam(defaultValue = "")
        folderPath: String,
        @RequestParam(defaultValue = "")
        kw: String,
        @RequestParam(required = false)
        mediaKind: CloudFileMediaKind?,
    ): CloudFileListResBody =
        CloudFileListResBody(
            files =
                cloudFileService.listFiles(
                    ownerMemberId = securityUser.id,
                    folderPath = folderPath.trim().takeIf(String::isNotBlank),
                    keyword = kw,
                    mediaKind = mediaKind,
                ),
        )

    @PostMapping("/files", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    @ApiResponse(responseCode = "201", description = "Created")
    @ResponseStatus(HttpStatus.CREATED)
    fun upload(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @RequestPart("file") file: MultipartFile,
        @RequestParam(defaultValue = "")
        folderPath: String,
        @RequestParam(required = false)
        clientFilename: String?,
    ): ResponseEntity<RsData<CloudFileDto>> {
        val uploaded =
            cloudFileService.upload(
                ownerMemberId = securityUser.id,
                originalFilename = file.originalFilename,
                clientOriginalFilename = clientFilename,
                contentType = file.contentType,
                bytes = file.bytes,
                folderPath = folderPath,
            )

        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(RsData("201-1", "클라우드 파일이 업로드되었습니다.", uploaded))
    }

    @PostMapping("/files/video-upload-sessions")
    @ApiResponse(responseCode = "201", description = "Created")
    @ResponseStatus(HttpStatus.CREATED)
    fun createVideoUploadSession(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @RequestBody body: CreateVideoUploadSessionReqBody,
    ): ResponseEntity<RsData<CloudVideoUploadSessionDto>> {
        val session =
            cloudVideoUploadSessionService.createSession(
                ownerMemberId = securityUser.id,
                originalFilename = body.originalFilename,
                contentType = body.contentType,
                byteSize = body.byteSize ?: 0,
                folderPath = body.folderPath,
            )

        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(RsData("201-1", "대용량 동영상 업로드 세션이 생성되었습니다.", session))
    }

    @GetMapping("/files/video-upload-sessions/{sessionId}")
    @Transactional(readOnly = true)
    fun getVideoUploadSession(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        sessionId: Long,
    ): CloudVideoUploadSessionDto =
        cloudVideoUploadSessionService.getSession(
            ownerMemberId = securityUser.id,
            sessionId = sessionId,
        )

    @PutMapping("/files/video-upload-sessions/{sessionId}/parts/{partNumber}")
    fun uploadVideoPart(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        sessionId: Long,
        @PathVariable
        @Positive
        partNumber: Int,
        request: HttpServletRequest,
    ): CloudVideoUploadPartResultDto =
        cloudVideoUploadSessionService.uploadPart(
            ownerMemberId = securityUser.id,
            sessionId = sessionId,
            partNumber = partNumber,
            bytes = request.inputStream.readBytes(),
        )

    @PostMapping("/files/video-upload-sessions/{sessionId}/complete")
    fun completeVideoUpload(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        sessionId: Long,
    ): RsData<CloudFileDto> {
        val file =
            cloudVideoUploadSessionService.complete(
                ownerMemberId = securityUser.id,
                sessionId = sessionId,
            )

        return RsData("200-1", "대용량 동영상 업로드가 완료되었습니다.", file)
    }

    @DeleteMapping("/files/video-upload-sessions/{sessionId}")
    fun cancelVideoUpload(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        sessionId: Long,
    ): RsData<Void> {
        cloudVideoUploadSessionService.cancel(
            ownerMemberId = securityUser.id,
            sessionId = sessionId,
        )

        return RsData("200-1", "대용량 동영상 업로드가 취소되었습니다.")
    }

    @GetMapping("/files/{id}")
    @Transactional(readOnly = true)
    fun getFile(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
    ): CloudFileDto =
        cloudFileService.get(
            ownerMemberId = securityUser.id,
            fileId = id,
        )

    @GetMapping("/files/{id}/content")
    @Transactional(readOnly = true)
    fun content(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
        request: HttpServletRequest,
    ): ResponseEntity<Resource> {
        val content =
            cloudFileService.openContent(
                ownerMemberId = securityUser.id,
                fileId = id,
            )
        val storedObject = content.storedObject
        val totalLength = storedObject.contentLength ?: -1
        val rangeHeader = request.getHeader(HttpHeaders.RANGE)

        // 동영상 seek 호환을 위해 단일 byte range만 허용하고 multi-range는 거절한다.
        if (!rangeHeader.isNullOrBlank()) {
            if (totalLength <= 0) {
                storedObject.close()
                return noStoreHeaders(
                    ResponseEntity
                        .status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */*"),
                ).build()
            }

            val range = parseSingleRange(rangeHeader, totalLength)
            if (range == null) {
                storedObject.close()
                return noStoreHeaders(
                    ResponseEntity
                        .status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */$totalLength"),
                ).build()
            }

            return noStoreHeaders(
                ResponseEntity
                    .status(HttpStatus.PARTIAL_CONTENT)
                    .contentType(safeMediaType(storedObject.contentType))
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .header(HttpHeaders.CONTENT_RANGE, "bytes ${range.first}-${range.last}/$totalLength")
                    .header(HttpHeaders.CONTENT_DISPOSITION, inlineDisposition(content.file.originalFilename))
                    .contentLength(range.last - range.first + 1),
            ).body(InputStreamResource(sliceStream(storedObject.inputStream, range)))
        }

        val responseBuilder =
            noStoreHeaders(
                ResponseEntity
                    .ok()
                    .contentType(safeMediaType(storedObject.contentType))
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .header(HttpHeaders.CONTENT_DISPOSITION, inlineDisposition(content.file.originalFilename)),
            )
        val finalizedBuilder =
            totalLength
                .takeIf { it >= 0 }
                ?.let(responseBuilder::contentLength)
                ?: responseBuilder

        return finalizedBuilder.body(InputStreamResource(storedObject.inputStream))
    }

    @DeleteMapping("/files/{id}")
    fun delete(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
    ): RsData<Void> {
        cloudFileService.delete(
            ownerMemberId = securityUser.id,
            fileId = id,
        )

        return RsData("200-1", "클라우드 파일이 삭제되었습니다.")
    }

    private fun inlineDisposition(filename: String): String =
        ContentDisposition
            .inline()
            .filename(filename, StandardCharsets.UTF_8)
            .build()
            .toString()

    private fun safeMediaType(contentType: String): MediaType =
        runCatching { MediaType.parseMediaType(contentType) }
            .getOrElse { throw AppException("500-1", "클라우드 파일 콘텐츠 타입이 올바르지 않습니다.") }

    private fun <T : ResponseEntity.BodyBuilder> noStoreHeaders(builder: T): T {
        builder.header(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0")
        builder.header(HttpHeaders.PRAGMA, "no-cache")
        builder.header(HttpHeaders.EXPIRES, "0")
        builder.header("X-Content-Type-Options", "nosniff")
        return builder
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
