package com.back.boundedContexts.post.app

import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.exception.app.AppException
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception
import java.net.URI
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID

@Service
class PostImageStorageService(
    private val properties: PostImageStorageProperties,
) {
    data class StoredImage(
        val bytes: ByteArray,
        val contentType: String,
    )

    private val datePathFormatter = DateTimeFormatter.ofPattern("yyyy/MM")
    private val logger = LoggerFactory.getLogger(javaClass)

    private var s3Client: S3Client? = null
    private var initErrorMessage: String? = null

    @PostConstruct
    fun initializeBucket() {
        if (!properties.enabled) return

        val client = try {
            buildClient()
        } catch (e: Exception) {
            initErrorMessage = "이미지 스토리지 설정 오류: ${e.message ?: "알 수 없는 오류"}"
            logger.error("Post image storage client initialization failed: {}", initErrorMessage)
            return
        }

        s3Client = client

        try {
            client.headBucket(
                HeadBucketRequest.builder()
                    .bucket(properties.bucket)
                    .build()
            )
        } catch (headError: Exception) {
            try {
                client.createBucket(
                    CreateBucketRequest.builder()
                        .bucket(properties.bucket)
                        .build()
                )
            } catch (createError: Exception) {
                initErrorMessage = "스토리지 버킷 초기화 실패: ${createError.message ?: headError.message ?: "알 수 없는 오류"}"
                logger.error("Post image storage bucket initialization failed", createError)
                return
            }
        }

        initErrorMessage = null
    }

    fun uploadPostImage(file: MultipartFile): String {
        val client = requireClient()

        if (file.isEmpty) throw AppException("400-1", "이미지 파일이 비어 있습니다.")
        if (file.size > properties.maxFileSizeBytes) {
            throw AppException("400-1", "이미지 파일은 ${properties.maxFileSizeBytes / (1024 * 1024)}MB 이하여야 합니다.")
        }

        val contentType = file.contentType?.lowercase() ?: ""
        if (!contentType.startsWith("image/")) {
            throw AppException("400-1", "이미지 파일만 업로드할 수 있습니다.")
        }

        val key = buildObjectKey(file.originalFilename)

        try {
            client.putObject(
                PutObjectRequest.builder()
                    .bucket(properties.bucket)
                    .key(key)
                    .contentType(contentType)
                    .build(),
                RequestBody.fromInputStream(file.inputStream, file.size)
            )
        } catch (e: Exception) {
            throw AppException("500-1", "이미지 업로드에 실패했습니다. ${e.message ?: ""}".trim())
        }

        return key
    }

    fun getPostImage(objectKey: String): StoredImage? {
        val client = requireClient()
        validateObjectKey(objectKey)

        return try {
            val bytes = client.getObjectAsBytes(
                GetObjectRequest.builder()
                    .bucket(properties.bucket)
                    .key(objectKey)
                    .build()
            )
            StoredImage(
                bytes = bytes.asByteArray(),
                contentType = bytes.response().contentType() ?: "application/octet-stream"
            )
        } catch (_: NoSuchKeyException) {
            null
        } catch (e: S3Exception) {
            if (e.statusCode() == 404) return null
            throw AppException("500-1", "이미지를 불러오지 못했습니다. ${e.message ?: ""}".trim())
        }
    }

    private fun ensureStorageEnabled() {
        if (!properties.enabled) throw AppException("503-1", "이미지 스토리지가 비활성화되어 있습니다.")
    }

    private fun requireClient(): S3Client {
        ensureStorageEnabled()

        initErrorMessage?.let {
            throw AppException("503-1", it)
        }

        return s3Client ?: throw AppException("503-1", "이미지 스토리지가 아직 준비되지 않았습니다.")
    }

    private fun buildClient(): S3Client {
        if (properties.accessKey.isBlank() || properties.secretKey.isBlank()) {
            throw IllegalArgumentException("스토리지 계정 정보가 비어 있습니다.")
        }
        if (properties.accessKey.contains("\${") || properties.secretKey.contains("\${")) {
            throw IllegalArgumentException("CUSTOM_STORAGE_ACCESSKEY 또는 CUSTOM_STORAGE_SECRETKEY에 미해결 placeholder가 포함되어 있습니다.")
        }

        val endpoint = properties.endpoint.trim()
        if (endpoint.contains("\${")) {
            throw IllegalArgumentException("CUSTOM_STORAGE_ENDPOINT에 미해결 placeholder가 포함되어 있습니다. (현재: $endpoint)")
        }
        if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
            throw IllegalArgumentException("CUSTOM_STORAGE_ENDPOINT 형식이 올바르지 않습니다. (현재: $endpoint)")
        }

        val endpointUri = try {
            URI.create(endpoint)
        } catch (e: Exception) {
            throw IllegalArgumentException("CUSTOM_STORAGE_ENDPOINT가 유효한 URI가 아닙니다. (현재: $endpoint)")
        }

        return S3Client.builder()
            .endpointOverride(endpointUri)
            .region(Region.of(properties.region))
            .credentialsProvider(
                StaticCredentialsProvider.create(
                    AwsBasicCredentials.create(properties.accessKey, properties.secretKey)
                )
            )
            .forcePathStyle(properties.pathStyleAccess)
            .build()
    }

    private fun buildObjectKey(originalFilename: String?): String {
        val ext = extractExtension(originalFilename)
        val datePath = LocalDate.now().format(datePathFormatter)
        val prefix = properties.keyPrefix.trim().trim('/')
        val uuid = UUID.randomUUID().toString()
        return if (prefix.isBlank()) "$datePath/$uuid$ext" else "$prefix/$datePath/$uuid$ext"
    }

    private fun extractExtension(originalFilename: String?): String {
        val name = originalFilename?.trim().orEmpty()
        if (!name.contains(".")) return ""
        val ext = name.substringAfterLast(".")
            .lowercase()
            .replace(Regex("[^a-z0-9]"), "")
            .take(10)
        return if (ext.isBlank()) "" else ".$ext"
    }

    private fun validateObjectKey(objectKey: String) {
        if (objectKey.isBlank() || objectKey.contains("..") || objectKey.startsWith("/")) {
            throw AppException("400-1", "유효하지 않은 이미지 경로입니다.")
        }
    }
}
