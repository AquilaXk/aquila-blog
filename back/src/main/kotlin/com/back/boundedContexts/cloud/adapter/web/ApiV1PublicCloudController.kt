package com.back.boundedContexts.cloud.adapter.web

import com.back.boundedContexts.cloud.application.service.CloudExternalPlaybackTokenService
import io.micrometer.core.instrument.MeterRegistry
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.constraints.Positive
import org.springframework.core.io.Resource
import org.springframework.http.ResponseEntity
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestMethod
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/system/api/v1/public/cloud")
@Tag(name = "ApiV1PublicCloudController", description = "Public Cloud Playback API")
@Validated
class ApiV1PublicCloudController(
    private val cloudExternalPlaybackTokenService: CloudExternalPlaybackTokenService,
    private val meterRegistry: MeterRegistry? = null,
) {
    @GetMapping("/files/{id}/playback")
    @Operation(summary = "외부 비디오 파일 재생")
    fun playback(
        @PathVariable
        @Positive
        id: Long,
        @RequestParam
        token: String,
        request: HttpServletRequest,
    ): ResponseEntity<Resource> =
        CloudContentWebSupport.contentResponse(
            request = request,
            meterRegistry = meterRegistry,
            endpoint = "playback",
            loadFile = {
                cloudExternalPlaybackTokenService.getFile(
                    token = token,
                    fileId = id,
                )
            },
            openRange = { loaded, range ->
                cloudExternalPlaybackTokenService.openContentRange(
                    file = loaded,
                    range = range,
                )
            },
            openFull = {
                cloudExternalPlaybackTokenService.openContent(
                    token = token,
                    fileId = id,
                )
            },
        )

    @RequestMapping(method = [RequestMethod.HEAD], path = ["/files/{id}/playback"])
    @Operation(summary = "외부 비디오 파일 메타데이터 조회")
    fun playbackHead(
        @PathVariable
        @Positive
        id: Long,
        @RequestParam
        token: String,
    ): ResponseEntity<Void> =
        CloudContentWebSupport.headMetadataResponse(
            cloudExternalPlaybackTokenService.getFile(
                token = token,
                fileId = id,
            ),
        )

    @GetMapping("/files/{id}/share")
    @Operation(summary = "서명 공유 링크 파일 콘텐츠 조회")
    fun shareContent(
        @PathVariable
        @Positive
        id: Long,
        @RequestParam
        token: String,
        @RequestParam(defaultValue = "false")
        download: Boolean,
        request: HttpServletRequest,
    ): ResponseEntity<Resource> =
        CloudContentWebSupport.contentResponse(
            request = request,
            meterRegistry = meterRegistry,
            endpoint = "share",
            download = download,
            loadFile = {
                cloudExternalPlaybackTokenService.getSharedFile(
                    token = token,
                    fileId = id,
                )
            },
            openRange = { loaded, range ->
                cloudExternalPlaybackTokenService.openContentRange(
                    file = loaded,
                    range = range,
                )
            },
            openFull = {
                cloudExternalPlaybackTokenService.openSharedContent(
                    token = token,
                    fileId = id,
                )
            },
        )

    @RequestMapping(method = [RequestMethod.HEAD], path = ["/files/{id}/share"])
    @Operation(summary = "서명 공유 링크 파일 메타데이터 조회")
    fun shareHead(
        @PathVariable
        @Positive
        id: Long,
        @RequestParam
        token: String,
    ): ResponseEntity<Void> =
        CloudContentWebSupport.headMetadataResponse(
            cloudExternalPlaybackTokenService.getSharedFile(
                token = token,
                fileId = id,
            ),
        )
}
