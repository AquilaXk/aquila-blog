package com.back.boundedContexts.post.adapter.`in`.web

import com.back.boundedContexts.post.application.port.out.PostImageStoragePort
import com.back.global.app.AppConfig
import com.back.global.exception.app.AppException
import com.back.global.rsData.RsData
import com.back.global.storage.app.UploadedFileRetentionService
import com.back.global.storage.domain.UploadedFilePurpose
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.CacheControl
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
    fun getPostImage(request: HttpServletRequest): ResponseEntity<ByteArray> {
        val objectKey = extractObjectKey(request)
        val image =
            postImageStorageService.getPostImage(objectKey)
                ?: throw AppException("404-1", "이미지를 찾을 수 없습니다.")

        return ResponseEntity
            .ok()
            .contentType(MediaType.parseMediaType(image.contentType))
            .cacheControl(
                CacheControl
                    .maxAge(30, TimeUnit.DAYS)
                    .cachePublic()
                    .immutable(),
            ).body(image.bytes)
    }

    private fun extractObjectKey(request: HttpServletRequest): String {
        val prefix = "/post/api/v1/images/"
        val path = request.requestURI
        if (!path.startsWith(prefix)) throw AppException("400-1", "잘못된 이미지 경로입니다.")

        val encodedKey = path.removePrefix(prefix).trim()
        if (encodedKey.isBlank()) throw AppException("404-1", "이미지를 찾을 수 없습니다.")
        return URLDecoder.decode(encodedKey, StandardCharsets.UTF_8)
    }
}
