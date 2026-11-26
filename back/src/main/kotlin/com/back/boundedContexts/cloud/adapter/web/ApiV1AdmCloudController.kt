package com.back.boundedContexts.cloud.adapter.web

import com.back.boundedContexts.cloud.application.service.CloudExternalPlaybackTokenDto
import com.back.boundedContexts.cloud.application.service.CloudExternalPlaybackTokenListResBody
import com.back.boundedContexts.cloud.application.service.CloudExternalPlaybackTokenService
import com.back.boundedContexts.cloud.application.service.CloudFileDto
import com.back.boundedContexts.cloud.application.service.CloudFileService
import com.back.boundedContexts.cloud.application.service.CloudThumbnailRenderer
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadPartResultDto
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadSessionDto
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadSessionService
import com.back.boundedContexts.cloud.application.service.RevokeExternalPlaybackTokensResBody
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.storage.application.UploadedFileUrlCodec
import com.back.global.storage.config.StoragePropertiesPort
import com.back.global.storage.domain.UploadedFilePurpose
import io.micrometer.core.instrument.MeterRegistry
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotEmpty
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.Size
import org.springframework.core.io.Resource
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
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

/**
 * 참조 구현: strapi/strapi (MIT) packages/core/upload & payloadcms/payload (MIT)
 * 관리자 클라우드 미디어 워크스페이스 컨트롤러.
 */
@Validated
@RestController
@RequestMapping("/system/api/v1/adm/cloud")
class ApiV1AdmCloudController(
    private val cloudFileService: CloudFileService,
    private val cloudVideoUploadSessionService: CloudVideoUploadSessionService,
    private val cloudExternalPlaybackTokenService: CloudExternalPlaybackTokenService,
    private val postImageStorageService: PostImageStoragePort? = null,
    private val uploadedFileRetentionService: UploadedFileRetentionService? = null,
    private val storageProperties: StoragePropertiesPort? = null,
    private val meterRegistry: MeterRegistry? = null,
) {
    data class CloudFileListResBody(
        val files: List<CloudFileDto>,
    )

    data class CloudFileFacetsResBody(
        val allCount: Long,
        val allBytes: Long,
        val photoCount: Long,
        val photoBytes: Long,
        val videoCount: Long,
        val videoBytes: Long,
        val documentCount: Long,
        val documentBytes: Long,
        val folders: List<String> = emptyList(),
    )

    data class BulkDeleteCloudFilesReqBody(
        @field:NotEmpty
        @field:Size(max = 100)
        val ids: List<@Positive Long>,
    )

    data class BulkDeleteCloudFilesResBody(
        val deletedIds: List<Long>,
        val deletedCount: Int,
    )

    data class PromoteCloudPostAssetResBody(
        val fileId: Long,
        val key: String,
        val url: String,
        val markdown: String,
    )

    data class IssueCloudExternalTokenReqBody(
        val ttlSeconds: Long? = null,
    )

    data class CreateVideoUploadSessionReqBody(
        val originalFilename: String?,
        val contentType: String?,
        val byteSize: Long?,
        val folderPath: String? = "",
    )

    data class UpdateCloudFileReqBody(
        val originalFilename: String?,
        val folderPath: String?,
    )

    @GetMapping("/files/facets")
    @Transactional(readOnly = true)
    fun facets(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): CloudFileFacetsResBody = cloudFileService.getFacets(securityUser.id)

    @PostMapping("/files/bulk-delete")
    fun bulkDelete(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @RequestBody @Valid body: BulkDeleteCloudFilesReqBody,
    ): RsData<BulkDeleteCloudFilesResBody> {
        val result =
            cloudFileService.bulkDelete(
                ownerMemberId = securityUser.id,
                fileIds = body.ids,
            )
        return RsData("200-1", "클라우드 파일들이 삭제되었습니다.", result)
    }

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
        val contentLength = request.contentLengthLong
        if (contentLength <= 0L) {
            throw AppException(ErrorCode.BAD_REQUEST, "업로드 조각 크기가 올바르지 않습니다.")
        }
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
        @RequestBody(required = false)
        body: IssueCloudExternalTokenReqBody? = null,
    ): ResponseEntity<RsData<CloudExternalPlaybackTokenDto>> {
        val issued =
            cloudExternalPlaybackTokenService.issue(
                ownerMemberId = securityUser.id,
                fileId = id,
                ttlSeconds = body?.ttlSeconds,
            )

        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(RsData("201-1", "외부 재생 token이 발급되었습니다.", issued))
    }

    @GetMapping("/files/{id}/content")
    fun content(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
        @RequestParam(defaultValue = "false")
        download: Boolean,
        @RequestParam(defaultValue = "false")
        thumbnail: Boolean,
        request: HttpServletRequest,
    ): ResponseEntity<Resource> =
        CloudContentWebSupport.contentResponse(
            request = request,
            meterRegistry = meterRegistry,
            endpoint = if (thumbnail) "thumbnail" else "content",
            download = download,
            thumbnail = thumbnail,
            loadFile = {
                cloudFileService.get(
                    ownerMemberId = securityUser.id,
                    fileId = id,
                )
            },
            openRange = { file, byteRange ->
                cloudFileService.openContentRange(
                    file = file,
                    range = byteRange,
                )
            },
            openFull = {
                if (thumbnail) {
                    val file =
                        cloudFileService.get(
                            ownerMemberId = securityUser.id,
                            fileId = id,
                        )
                    CloudThumbnailRenderer.openThumbnailOrFallback(file) {
                        cloudFileService.openContent(
                            ownerMemberId = securityUser.id,
                            fileId = id,
                        )
                    }
                } else {
                    cloudFileService.openContent(
                        ownerMemberId = securityUser.id,
                        fileId = id,
                    )
                }
            },
        )

    @RequestMapping(method = [RequestMethod.HEAD], path = ["/files/{id}/content"])
    fun contentHead(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
        @RequestParam(defaultValue = "false")
        thumbnail: Boolean,
    ): ResponseEntity<Void> = headMetadata(securityUser = securityUser, id = id, thumbnail = thumbnail)

    @GetMapping("/files/{id}/thumbnail")
    fun thumbnail(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
        request: HttpServletRequest,
    ): ResponseEntity<Resource> =
        content(
            securityUser = securityUser,
            id = id,
            download = false,
            thumbnail = true,
            request = request,
        )

    @RequestMapping(method = [RequestMethod.HEAD], path = ["/files/{id}/thumbnail"])
    fun thumbnailHead(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
    ): ResponseEntity<Void> = headMetadata(securityUser = securityUser, id = id, thumbnail = true)

    private fun headMetadata(
        securityUser: SecurityUser,
        id: Long,
        thumbnail: Boolean,
    ): ResponseEntity<Void> =
        CloudContentWebSupport.headMetadataResponse(
            file =
                cloudFileService.get(
                    ownerMemberId = securityUser.id,
                    fileId = id,
                ),
            thumbnail = thumbnail,
        )

    @PatchMapping("/files/{id}")
    fun update(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
        @RequestBody body: UpdateCloudFileReqBody,
    ): RsData<CloudFileDto> {
        val updated =
            cloudFileService.updateFile(
                ownerMemberId = securityUser.id,
                fileId = id,
                originalFilename = body.originalFilename,
                folderPath = body.folderPath,
            )

        return RsData("200-1", "클라우드 파일 정보를 수정했습니다.", updated)
    }

    @PostMapping("/files/{id}/promote-post-asset")
    @ApiResponse(responseCode = "201", description = "Created")
    @ResponseStatus(HttpStatus.CREATED)
    fun promotePostAsset(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
    ): ResponseEntity<RsData<PromoteCloudPostAssetResBody>> {
        val file =
            cloudFileService.get(
                ownerMemberId = securityUser.id,
                fileId = id,
            )
        if (file.mediaKind != CloudFileMediaKind.PHOTO) {
            throw AppException(ErrorCode.BAD_REQUEST, "이미지 파일만 게시글 에셋으로 승격할 수 있습니다.")
        }
        val normalizedType =
            file.contentType
                .substringBefore(';')
                .trim()
                .lowercase()
        if (normalizedType !in setOf("image/jpeg", "image/png", "image/gif", "image/webp")) {
            throw AppException(ErrorCode.BAD_REQUEST, "게시글 에셋 승격은 정적 래스터 이미지(JPEG·PNG·GIF·WebP)만 지원합니다.")
        }
        val maxAllowedBytes = minOf(8L * 1024 * 1024, storageProperties?.maxFileSizeBytes ?: (8L * 1024 * 1024))
        if (file.byteSize > maxAllowedBytes) {
            val limitMb = (maxAllowedBytes + (1024 * 1024) - 1) / (1024 * 1024)
            throw AppException(ErrorCode.PAYLOAD_TOO_LARGE, "이미지 파일은 ${limitMb}MB 이하여야 합니다.")
        }

        val storageService =
            postImageStorageService
                ?: throw AppException(ErrorCode.INTERNAL_ERROR, "게시글 이미지 스토리지 서비스를 사용할 수 없습니다.")
        val retentionService =
            uploadedFileRetentionService
                ?: throw AppException(ErrorCode.INTERNAL_ERROR, "업로드 보존 관리 서비스를 사용할 수 없습니다.")

        val key =
            cloudFileService.openContent(securityUser.id, id).storedObject.use { storedObject ->
                val uploadRequest =
                    PostImageStoragePort.UploadImageRequest(
                        inputStream = storedObject.inputStream,
                        contentLength = file.byteSize,
                        contentType = file.contentType,
                        originalFilename = file.originalFilename,
                    )
                storageService.uploadPostImage(uploadRequest)
            }

        retentionService.registerTempUploadWithCompensation(
            objectKey = key,
            contentType = file.contentType.orEmpty(),
            fileSize = file.byteSize,
            purpose = UploadedFilePurpose.POST_IMAGE,
        )

        val url = UploadedFileUrlCodec.buildImageUrl(key)
        val escapedName =
            file.originalFilename
                .replace("\\", "\\\\")
                .replace("[", "\\[")
                .replace("]", "\\]")
        val markdown = "![$escapedName]($url)"

        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(
                RsData(
                    "201-1",
                    "게시글 이미지로 승격되었습니다.",
                    PromoteCloudPostAssetResBody(
                        fileId = file.id,
                        key = key,
                        url = url,
                        markdown = markdown,
                    ),
                ),
            )
    }

    @PostMapping("/files/{id}/share-links")
    @ApiResponse(responseCode = "201", description = "Created")
    fun issueShareLink(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
        @RequestBody(required = false)
        body: IssueCloudExternalTokenReqBody? = null,
    ): ResponseEntity<RsData<CloudExternalPlaybackTokenDto>> {
        val issued =
            cloudExternalPlaybackTokenService.issueShareLink(
                ownerMemberId = securityUser.id,
                fileId = id,
                ttlSeconds = body?.ttlSeconds,
            )

        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(RsData("201-1", "외부 공유 링크가 발급되었습니다.", issued))
    }

    @GetMapping("/files/{id}/share-links")
    @Transactional(readOnly = true)
    fun listShareLinks(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
    ): CloudExternalPlaybackTokenListResBody =
        CloudExternalPlaybackTokenListResBody(
            tokens =
                cloudExternalPlaybackTokenService.listShareTokens(
                    ownerMemberId = securityUser.id,
                    fileId = id,
                ),
        )

    @DeleteMapping("/files/{id}/share-links/{tokenId}")
    fun revokeShareLink(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
        @PathVariable
        @Positive
        tokenId: Long,
    ): RsData<Void> {
        cloudExternalPlaybackTokenService.revokeShareToken(
            ownerMemberId = securityUser.id,
            fileId = id,
            tokenId = tokenId,
        )
        return RsData("200-1", "외부 공유 링크가 폐기되었습니다.")
    }

    @DeleteMapping("/files/{id}/share-links")
    fun revokeAllShareLinks(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
    ): RsData<RevokeExternalPlaybackTokensResBody> {
        val count =
            cloudExternalPlaybackTokenService.revokeAllShareTokens(
                ownerMemberId = securityUser.id,
                fileId = id,
            )
        return RsData(
            "200-1",
            "외부 공유 링크가 모두 폐기되었습니다.",
            RevokeExternalPlaybackTokensResBody(revokedCount = count),
        )
    }

    @GetMapping("/files/{id}/external-playback-tokens")
    @Transactional(readOnly = true)
    fun listExternalPlaybackTokens(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
    ): CloudExternalPlaybackTokenListResBody =
        CloudExternalPlaybackTokenListResBody(
            tokens =
                cloudExternalPlaybackTokenService.listActiveTokens(
                    ownerMemberId = securityUser.id,
                    fileId = id,
                ),
        )

    @DeleteMapping("/files/{id}/external-playback-tokens/{tokenId}")
    fun revokeExternalPlaybackToken(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
        @PathVariable
        @Positive
        tokenId: Long,
    ): RsData<Void> {
        cloudExternalPlaybackTokenService.revokeToken(
            ownerMemberId = securityUser.id,
            fileId = id,
            tokenId = tokenId,
        )
        return RsData("200-1", "외부 재생 token이 폐기되었습니다.")
    }

    @DeleteMapping("/files/{id}/external-playback-tokens")
    fun revokeAllExternalPlaybackTokens(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable
        @Positive
        id: Long,
    ): RsData<RevokeExternalPlaybackTokensResBody> {
        val count =
            cloudExternalPlaybackTokenService.revokeAllTokens(
                ownerMemberId = securityUser.id,
                fileId = id,
            )
        return RsData(
            "200-1",
            "외부 재생 token이 모두 폐기되었습니다.",
            RevokeExternalPlaybackTokensResBody(revokedCount = count),
        )
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
}
