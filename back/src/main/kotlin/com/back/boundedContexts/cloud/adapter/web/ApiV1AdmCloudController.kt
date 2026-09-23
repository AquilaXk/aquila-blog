package com.back.boundedContexts.cloud.adapter.web

import com.back.boundedContexts.cloud.application.service.CloudExternalPlaybackTokenDto
import com.back.boundedContexts.cloud.application.service.CloudExternalPlaybackTokenService
import com.back.boundedContexts.cloud.application.service.CloudFileDto
import com.back.boundedContexts.cloud.application.service.CloudFileService
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadPartResultDto
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadSessionDto
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadSessionService
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import io.micrometer.core.instrument.MeterRegistry
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.constraints.Positive
import org.springframework.core.io.Resource
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
import org.springframework.web.bind.annotation.RequestMethod
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import io.swagger.v3.oas.annotations.parameters.RequestBody as OpenApiRequestBody

@Validated
@RestController
@RequestMapping("/system/api/v1/adm/cloud")
class ApiV1AdmCloudController(
    private val cloudFileService: CloudFileService,
    private val cloudVideoUploadSessionService: CloudVideoUploadSessionService,
    private val cloudExternalPlaybackTokenService: CloudExternalPlaybackTokenService,
    private val meterRegistry: MeterRegistry? = null,
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
                inputStream = file.inputStream,
                contentLength = file.size,
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

    @PutMapping(
        "/files/video-upload-sessions/{sessionId}/parts/{partNumber}",
        consumes = [MediaType.APPLICATION_OCTET_STREAM_VALUE],
    )
    @Operation(
        requestBody =
            OpenApiRequestBody(
                required = true,
                content = [
                    Content(
                        mediaType = MediaType.APPLICATION_OCTET_STREAM_VALUE,
                        schema = Schema(type = "string", format = "binary"),
                    ),
                ],
            ),
    )
    fun uploadVideoPart(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        sessionId: Long,
        @PathVariable
        @Positive
        partNumber: Int,
        request: HttpServletRequest,
    ): CloudVideoUploadPartResultDto {
        val session =
            cloudVideoUploadSessionService.getSession(
                ownerMemberId = securityUser.id,
                sessionId = sessionId,
            )
        if (partNumber !in 1..session.totalParts) {
            throw AppException(ErrorCode.BAD_REQUEST, "업로드 조각 번호가 올바르지 않습니다.")
        }
        val expectedBytes =
            if (partNumber == session.totalParts) {
                session.byteSize - (session.partSizeBytes * (partNumber - 1))
            } else {
                session.partSizeBytes
            }
        val contentLength = request.contentLengthLong
        if (contentLength > expectedBytes) {
            throw AppException(ErrorCode.BAD_REQUEST, "업로드 조각 크기가 올바르지 않습니다.")
        }

        return cloudVideoUploadSessionService.uploadPart(
            ownerMemberId = securityUser.id,
            sessionId = sessionId,
            partNumber = partNumber,
            inputStream = request.inputStream,
            contentLength = contentLength,
        )
    }

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

    @PostMapping("/files/{id}/external-playback-token")
    @ApiResponse(responseCode = "201", description = "Created")
    fun issueExternalPlaybackToken(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
    ): ResponseEntity<RsData<CloudExternalPlaybackTokenDto>> {
        val issued =
            cloudExternalPlaybackTokenService.issue(
                ownerMemberId = securityUser.id,
                fileId = id,
            )

        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(RsData("201-1", "외부 재생 token이 발급되었습니다.", issued))
    }

    @GetMapping("/files/{id}/content")
    @Transactional(readOnly = true)
    fun content(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
        request: HttpServletRequest,
    ): ResponseEntity<Resource> =
        CloudContentWebSupport.contentResponse(
            request = request,
            meterRegistry = meterRegistry,
            endpoint = "content",
            loadFile = {
                cloudFileService.get(
                    ownerMemberId = securityUser.id,
                    fileId = id,
                )
            },
            openRange = { range ->
                cloudFileService.openContentRange(
                    ownerMemberId = securityUser.id,
                    fileId = id,
                    range = range,
                )
            },
            openFull = {
                cloudFileService.openContent(
                    ownerMemberId = securityUser.id,
                    fileId = id,
                )
            },
        )

    @RequestMapping(method = [RequestMethod.HEAD], path = ["/files/{id}/content"])
    @Transactional(readOnly = true)
    fun contentHead(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
    ): ResponseEntity<Void> =
        CloudContentWebSupport.headMetadataResponse(
            cloudFileService.get(
                ownerMemberId = securityUser.id,
                fileId = id,
            ),
        )

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
}
