package com.back.global.storage.adapter

import com.back.global.exception.application.AppException
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.AbortMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.CompleteMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.CompletedMultipartUpload
import software.amazon.awssdk.services.s3.model.CompletedPart
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import software.amazon.awssdk.services.s3.model.CreateMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception
import software.amazon.awssdk.services.s3.model.UploadPartRequest
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

@Service
class CloudStorageAdapter(
    private val properties: CloudStorageProperties,
) : CloudStoragePort {
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

    override fun upload(request: CloudStoragePort.UploadRequest): CloudStoragePort.UploadResult {
        val client = requireClient()
        validateObjectKey(request.objectKey)

        try {
            client.putObject(
                PutObjectRequest
                    .builder()
                    .bucket(properties.bucket)
                    .key(request.objectKey)
                    .contentType(request.contentType)
                    .metadata(
                        mapOf(
                            "original-filename" to
                                URLEncoder
                                    .encode(request.originalFilename, StandardCharsets.UTF_8)
                                    .replace("+", "%20"),
                        ),
                    ).build(),
                RequestBody.fromBytes(request.bytes),
            )
        } catch (e: Exception) {
            logger.error("Cloud file upload failed (objectKey={})", request.objectKey, e)
            throw AppException("500-1", "클라우드 파일 업로드에 실패했습니다.")
        }

        return CloudStoragePort.UploadResult(
            objectKey = request.objectKey,
            checksumSha256 = sha256Hex(request.bytes),
        )
    }

    override fun open(objectKey: String): CloudStoragePort.StoredObject? {
        val client = requireClient()
        validateObjectKey(objectKey)

        return try {
            val response =
                client.getObject(
                    GetObjectRequest
                        .builder()
                        .bucket(properties.bucket)
                        .key(objectKey)
                        .build(),
                )
            CloudStoragePort.StoredObject(
                inputStream = response,
                contentType = response.response().contentType() ?: "application/octet-stream",
                contentLength = response.response().contentLength(),
                originalFilename = decodeStoredOriginalFilename(response.response().metadata()["original-filename"]),
            )
        } catch (_: NoSuchKeyException) {
            null
        } catch (e: S3Exception) {
            if (e.statusCode() == 404) return null
            logger.error("Cloud file download failed (objectKey={})", objectKey, e)
            throw AppException("500-1", "클라우드 파일을 불러오지 못했습니다.")
        }
    }

    override fun initiateMultipartUpload(
        request: CloudStoragePort.MultipartUploadInitRequest,
    ): CloudStoragePort.MultipartUploadInitResult {
        val client = requireClient()
        validateObjectKey(request.objectKey)

        return try {
            val response =
                client.createMultipartUpload(
                    CreateMultipartUploadRequest
                        .builder()
                        .bucket(properties.bucket)
                        .key(request.objectKey)
                        .contentType(request.contentType)
                        .metadata(
                            mapOf(
                                "original-filename" to
                                    URLEncoder
                                        .encode(request.originalFilename, StandardCharsets.UTF_8)
                                        .replace("+", "%20"),
                            ),
                        ).build(),
                )

            CloudStoragePort.MultipartUploadInitResult(
                objectKey = request.objectKey,
                uploadId = response.uploadId(),
            )
        } catch (e: Exception) {
            logger.error("Cloud multipart upload init failed (objectKey={})", request.objectKey, e)
            throw AppException("500-1", "클라우드 대용량 업로드를 시작하지 못했습니다.")
        }
    }

    override fun uploadMultipartPart(request: CloudStoragePort.MultipartUploadPartRequest): CloudStoragePort.MultipartUploadPartResult {
        val client = requireClient()
        validateObjectKey(request.objectKey)

        return try {
            val response =
                client.uploadPart(
                    UploadPartRequest
                        .builder()
                        .bucket(properties.bucket)
                        .key(request.objectKey)
                        .uploadId(request.uploadId)
                        .partNumber(request.partNumber)
                        .contentLength(request.bytes.size.toLong())
                        .build(),
                    RequestBody.fromBytes(request.bytes),
                )

            CloudStoragePort.MultipartUploadPartResult(
                partNumber = request.partNumber,
                eTag = response.eTag(),
            )
        } catch (e: Exception) {
            logger.error(
                "Cloud multipart part upload failed (objectKey={}, uploadId={}, partNumber={})",
                request.objectKey,
                request.uploadId,
                request.partNumber,
                e,
            )
            throw AppException("500-1", "클라우드 대용량 업로드 조각 저장에 실패했습니다.")
        }
    }

    override fun completeMultipartUpload(request: CloudStoragePort.MultipartUploadCompleteRequest) {
        val client = requireClient()
        validateObjectKey(request.objectKey)

        try {
            client.completeMultipartUpload(
                CompleteMultipartUploadRequest
                    .builder()
                    .bucket(properties.bucket)
                    .key(request.objectKey)
                    .uploadId(request.uploadId)
                    .multipartUpload(
                        CompletedMultipartUpload
                            .builder()
                            .parts(
                                request.parts
                                    .sortedBy { it.partNumber }
                                    .map {
                                        CompletedPart
                                            .builder()
                                            .partNumber(it.partNumber)
                                            .eTag(it.eTag)
                                            .build()
                                    },
                            ).build(),
                    ).build(),
            )
        } catch (e: Exception) {
            logger.error(
                "Cloud multipart complete failed (objectKey={}, uploadId={})",
                request.objectKey,
                request.uploadId,
                e,
            )
            throw AppException("500-1", "클라우드 대용량 업로드 완료에 실패했습니다.")
        }
    }

    override fun abortMultipartUpload(request: CloudStoragePort.MultipartUploadAbortRequest) {
        val client = requireClient()
        validateObjectKey(request.objectKey)

        try {
            client.abortMultipartUpload(
                AbortMultipartUploadRequest
                    .builder()
                    .bucket(properties.bucket)
                    .key(request.objectKey)
                    .uploadId(request.uploadId)
                    .build(),
            )
        } catch (e: S3Exception) {
            if (e.statusCode() == 404) return
            logger.error(
                "Cloud multipart abort failed (objectKey={}, uploadId={})",
                request.objectKey,
                request.uploadId,
                e,
            )
            throw AppException("500-1", "클라우드 대용량 업로드 취소에 실패했습니다.")
        } catch (e: Exception) {
            logger.error(
                "Cloud multipart abort failed (objectKey={}, uploadId={})",
                request.objectKey,
                request.uploadId,
                e,
            )
            throw AppException("500-1", "클라우드 대용량 업로드 취소에 실패했습니다.")
        }
    }

    override fun delete(objectKey: String) {
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
            logger.error("Cloud file delete failed (objectKey={})", objectKey, e)
            throw AppException("500-1", "클라우드 파일 삭제에 실패했습니다.")
        }
    }

    private fun initializeStorage(forceRetry: Boolean) {
        if (!properties.enabled) return

        synchronized(initLock) {
            if (!forceRetry && s3Client != null && initErrorMessage == null) return

            val client =
                try {
                    s3Client ?: buildClient()
                } catch (e: Exception) {
                    initErrorMessage = "클라우드 스토리지 설정 오류: ${e.message ?: "알 수 없는 오류"}"
                    logger.error("Cloud storage client initialization failed", e)
                    return
                }
            s3Client = client

            try {
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
                    initErrorMessage = "클라우드 스토리지 버킷 초기화 실패: ${createError.message ?: headError.message ?: "알 수 없는 오류"}"
                    logger.error("Cloud storage bucket initialization failed", createError)
                }
            }
        }
    }

    private fun requireClient(): S3Client {
        if (!properties.enabled) throw AppException("503-1", "클라우드 스토리지가 비활성화되어 있습니다.")

        if (s3Client == null || initErrorMessage != null) {
            initializeStorage(forceRetry = true)
        }

        initErrorMessage?.let { throw AppException("503-1", it) }

        return s3Client ?: throw AppException("503-1", "클라우드 스토리지가 아직 준비되지 않았습니다.")
    }

    private fun buildClient(): S3Client {
        val accessKey = resolveProperty(properties.accessKey, "CUSTOM_STORAGE_ACCESSKEY", "MINIO_ROOT_USER")
        val secretKey = resolveProperty(properties.secretKey, "CUSTOM_STORAGE_SECRETKEY", "MINIO_ROOT_PASSWORD")
        if (accessKey.isBlank() || secretKey.isBlank()) {
            throw IllegalArgumentException("스토리지 계정 정보가 비어 있습니다.")
        }

        val endpoint = resolveProperty(properties.endpoint, "CUSTOM_STORAGE_ENDPOINT", null)
        if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
            throw IllegalArgumentException("CUSTOM_STORAGE_ENDPOINT 형식이 올바르지 않습니다. (현재: $endpoint)")
        }

        return S3Client
            .builder()
            .endpointOverride(URI.create(endpoint))
            .region(Region.of(properties.region))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
            .forcePathStyle(properties.pathStyleAccess)
            .build()
    }

    private fun resolveProperty(
        rawValue: String,
        envKeyName: String,
        fallbackEnvKeyName: String?,
    ): String {
        val trimmed = rawValue.trim()
        val resolved =
            resolveEnvReference(trimmed)
                ?: trimmed.ifBlank { fallbackEnvKeyName?.let { System.getenv(it)?.trim().orEmpty() } ?: "" }

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

    private fun validateObjectKey(objectKey: String) {
        val prefix =
            properties.cloudKeyPrefix
                .trim()
                .trim('/')
                .ifBlank { "cloud" }
        // service 계층의 정규화가 우회되어도 cloud prefix 밖 object 접근은 어댑터에서 차단한다.
        if (
            objectKey.isBlank() ||
            objectKey.contains("..") ||
            objectKey.startsWith("/") ||
            !objectKey.startsWith("$prefix/")
        ) {
            throw AppException("400-1", "유효하지 않은 클라우드 파일 경로입니다.")
        }
    }

    private fun decodeStoredOriginalFilename(value: String?): String? {
        val encoded = value?.trim().orEmpty()
        if (encoded.isBlank()) return null
        return runCatching { URLDecoder.decode(encoded, StandardCharsets.UTF_8) }.getOrNull()
    }

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest
            .getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it) }

    companion object {
        private val ENV_REFERENCE_REGEX = Regex("^\\$\\{([A-Za-z_][A-Za-z0-9_]*)(?::-(.*))?}$")
    }
}
