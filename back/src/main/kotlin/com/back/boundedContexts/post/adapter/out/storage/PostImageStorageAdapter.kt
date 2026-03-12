package com.back.boundedContexts.post.adapter.out.storage

import com.back.boundedContexts.post.application.port.out.PostImageStoragePort
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
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
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
class PostImageStorageAdapter(
    private val properties: PostImageStorageProperties,
) : PostImageStoragePort {
    private val datePathFormatter = DateTimeFormatter.ofPattern("yyyy/MM")
    private val logger = LoggerFactory.getLogger(javaClass)
    private val initLock = Any()

    @Volatile
    private var s3Client: S3Client? = null

    @Volatile
    private var initErrorMessage: String? = null

    @PostConstruct
    fun initializeBucket() {
        initializeStorage(forceRetry = true)
    }

    // Storage may be unavailable during app boot (container startup race).
    // Keep this method retryable so requests can recover without a backend restart.
    private fun initializeStorage(forceRetry: Boolean) {
        if (!properties.enabled) return

        synchronized(initLock) {
            if (!forceRetry && s3Client != null && initErrorMessage == null) return

            val client =
                try {
                    s3Client ?: buildClient()
                } catch (e: Exception) {
                    initErrorMessage = "이미지 스토리지 설정 오류: ${e.message ?: "알 수 없는 오류"}"
                    logger.error("Post image storage client initialization failed", e)
                    return
                }
            s3Client = client

            try {
                // 이미 버킷이 있으면 그대로 사용하고, 없을 때만 createBucket을 시도한다.
                client.headBucket(
                    HeadBucketRequest
                        .builder()
                        .bucket(properties.bucket)
                        .build(),
                )
                initErrorMessage = null
            } catch (headError: Exception) {
                try {
                    client.createBucket(
                        CreateBucketRequest
                            .builder()
                            .bucket(properties.bucket)
                            .build(),
                    )
                    initErrorMessage = null
                } catch (createError: Exception) {
                    initErrorMessage = "스토리지 버킷 초기화 실패: ${createError.message ?: headError.message ?: "알 수 없는 오류"}"
                    logger.error("Post image storage bucket initialization failed", createError)
                }
            }
        }
    }

    override fun uploadPostImage(file: MultipartFile): String {
        val client = requireClient()
        if (file.isEmpty) throw AppException("400-1", "이미지 파일이 비어 있습니다.")
        if (file.size > properties.maxFileSizeBytes) {
            throw AppException("400-1", "이미지 파일은 ${properties.maxFileSizeBytes / (1024 * 1024)}MB 이하여야 합니다.")
        }

        val contentType = file.contentType?.lowercase() ?: ""
        if (contentType !in allowedContentTypes) {
            throw AppException("400-1", "이미지 파일만 업로드할 수 있습니다.")
        }
        val signature = file.inputStream.use { input -> input.readNBytes(16) }
        val detectedType = detectImageContentType(signature)
        if (detectedType == null || detectedType != contentType) {
            throw AppException("400-1", "지원하지 않는 이미지 형식입니다.")
        }

        val key = buildObjectKey(file.originalFilename)

        try {
            client.putObject(
                PutObjectRequest
                    .builder()
                    .bucket(properties.bucket)
                    .key(key)
                    .contentType(contentType)
                    .build(),
                RequestBody.fromInputStream(file.inputStream, file.size),
            )
        } catch (e: Exception) {
            throw AppException("500-1", "이미지 업로드에 실패했습니다. ${e.message ?: ""}".trim())
        }

        return key
    }

    override fun getPostImage(objectKey: String): PostImageStoragePort.StoredImage? {
        val client = requireClient()
        validateObjectKey(objectKey)

        return try {
            val bytes =
                client.getObjectAsBytes(
                    GetObjectRequest
                        .builder()
                        .bucket(properties.bucket)
                        .key(objectKey)
                        .build(),
                )
            PostImageStoragePort.StoredImage(
                bytes = bytes.asByteArray(),
                contentType = bytes.response().contentType() ?: "application/octet-stream",
            )
        } catch (_: NoSuchKeyException) {
            null
        } catch (e: S3Exception) {
            if (e.statusCode() == 404) return null
            throw AppException("500-1", "이미지를 불러오지 못했습니다. ${e.message ?: ""}".trim())
        }
    }

    override fun deletePostImage(objectKey: String) {
        val client = requireClient()
        validateObjectKey(objectKey)

        try {
            client.deleteObject(
                DeleteObjectRequest
                    .builder()
                    .bucket(properties.bucket)
                    .key(objectKey)
                    .build(),
            )
        } catch (e: S3Exception) {
            if (e.statusCode() == 404) return
            throw AppException("500-1", "이미지 삭제에 실패했습니다. ${e.message ?: ""}".trim())
        }
    }

    private fun ensureStorageEnabled() {
        if (!properties.enabled) throw AppException("503-1", "이미지 스토리지가 비활성화되어 있습니다.")
    }

    private fun requireClient(): S3Client {
        ensureStorageEnabled()

        // 부팅 시점에 MinIO가 늦게 떠도, 요청 시점에 재초기화 기회를 주어 503 고착을 막는다.
        if (s3Client == null || initErrorMessage != null) {
            initializeStorage(forceRetry = true)
        }

        initErrorMessage?.let {
            throw AppException("503-1", it)
        }

        return s3Client ?: throw AppException("503-1", "이미지 스토리지가 아직 준비되지 않았습니다.")
    }

    private fun buildClient(): S3Client {
        val accessKey =
            resolveProperty(
                rawValue = properties.accessKey,
                envKeyName = "CUSTOM_STORAGE_ACCESSKEY",
                fallbackEnvKeyName = "MINIO_ROOT_USER",
            )
        val secretKey =
            resolveProperty(
                rawValue = properties.secretKey,
                envKeyName = "CUSTOM_STORAGE_SECRETKEY",
                fallbackEnvKeyName = "MINIO_ROOT_PASSWORD",
            )

        if (accessKey.isBlank() || secretKey.isBlank()) {
            throw IllegalArgumentException("스토리지 계정 정보가 비어 있습니다.")
        }
        val endpoint =
            resolveProperty(
                rawValue = properties.endpoint,
                envKeyName = "CUSTOM_STORAGE_ENDPOINT",
                fallbackEnvKeyName = null,
            )
        if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
            throw IllegalArgumentException("CUSTOM_STORAGE_ENDPOINT 형식이 올바르지 않습니다. (현재: $endpoint)")
        }

        val endpointUri =
            try {
                URI.create(endpoint)
            } catch (e: Exception) {
                throw IllegalArgumentException("CUSTOM_STORAGE_ENDPOINT가 유효한 URI가 아닙니다. (현재: $endpoint)")
            }

        return S3Client
            .builder()
            .endpointOverride(endpointUri)
            .region(Region.of(properties.region))
            .credentialsProvider(
                StaticCredentialsProvider.create(
                    AwsBasicCredentials.create(accessKey, secretKey),
                ),
            ).forcePathStyle(properties.pathStyleAccess)
            .build()
    }

    private fun resolveProperty(
        rawValue: String,
        envKeyName: String,
        fallbackEnvKeyName: String?,
    ): String {
        val trimmed = rawValue.trim()
        val resolved =
            // ".env에 ${ENV}" 형태가 들어온 경우 실제 환경변수 값으로 해석한다.
            resolveEnvReference(trimmed)
                ?: trimmed
                    .ifBlank { fallbackEnvKeyName?.let { System.getenv(it)?.trim().orEmpty() } ?: "" }

        if (resolved.contains("\${")) {
            throw IllegalArgumentException("${envKeyName}에 미해결 placeholder가 포함되어 있습니다. (현재: $resolved)")
        }

        return resolved
    }

    private fun resolveEnvReference(value: String): String? {
        val match = ENV_REFERENCE_REGEX.matchEntire(value) ?: return null
        val envName = match.groupValues[1]
        val defaultValue = match.groupValues.getOrNull(2).orEmpty()
        val envValue = System.getenv(envName)?.trim().orEmpty()
        return if (envValue.isNotBlank()) envValue else defaultValue
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
        val ext =
            name
                .substringAfterLast(".")
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

    companion object {
        private val allowedContentTypes =
            setOf(
                "image/jpeg",
                "image/png",
                "image/gif",
                "image/webp",
            )

        private val ENV_REFERENCE_REGEX = Regex("^\\$\\{([A-Za-z_][A-Za-z0-9_]*)(?::-(.*))?}$")
    }

    private fun detectImageContentType(signature: ByteArray): String? {
        if (signature.size >= 3 &&
            signature[0] == 0xFF.toByte() &&
            signature[1] == 0xD8.toByte() &&
            signature[2] == 0xFF.toByte()
        ) {
            return "image/jpeg"
        }

        if (signature.size >= 8 &&
            signature[0] == 0x89.toByte() &&
            signature[1] == 0x50.toByte() &&
            signature[2] == 0x4E.toByte() &&
            signature[3] == 0x47.toByte() &&
            signature[4] == 0x0D.toByte() &&
            signature[5] == 0x0A.toByte() &&
            signature[6] == 0x1A.toByte() &&
            signature[7] == 0x0A.toByte()
        ) {
            return "image/png"
        }

        if (signature.size >= 6) {
            val header = signature.copyOfRange(0, 6).toString(Charsets.US_ASCII)
            if (header == "GIF87a" || header == "GIF89a") return "image/gif"
        }

        if (signature.size >= 12) {
            val riff = signature.copyOfRange(0, 4).toString(Charsets.US_ASCII)
            val webp = signature.copyOfRange(8, 12).toString(Charsets.US_ASCII)
            if (riff == "RIFF" && webp == "WEBP") return "image/webp"
        }

        return null
    }
}
