package com.back.global.storage.adapter

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import com.back.global.storage.health.StorageDependencyFailureClassifier
import com.back.global.storage.health.StorageDependencyFailureReason
import com.back.global.storage.health.StorageDependencyProbeResult
import com.back.global.storage.health.StorageRuntimeConfigurationValidator
import com.back.global.storage.health.ValidatedStorageConfiguration
import com.back.global.storage.metrics.CloudMediaMetrics
import io.micrometer.core.instrument.MeterRegistry
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.AbortMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.CompleteMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.CompletedMultipartUpload
import software.amazon.awssdk.services.s3.model.CompletedPart
import software.amazon.awssdk.services.s3.model.CreateMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.HeadObjectRequest
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.NoSuchUploadException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception
import software.amazon.awssdk.services.s3.model.UploadPartRequest
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.DigestInputStream
import java.security.MessageDigest

@Service
class CloudStorageAdapter(
    private val properties: CloudStorageProperties,
    private val meterRegistry: MeterRegistry? = null,
) : CloudStoragePort {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val initLock = Any()

    @Volatile
    private var s3Client: S3Client? = null

    @Volatile
    private var initErrorMessage: String? = null

    @PostConstruct
    fun initializeDependency() {
        probeStorageDependency()
    }

    override fun upload(request: CloudStoragePort.UploadRequest): CloudStoragePort.UploadResult {
        val client = requireClient()
        validateObjectKey(request.objectKey)
        val digest = MessageDigest.getInstance("SHA-256")

        try {
            DigestInputStream(request.inputStream, digest).use { body ->
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
                    RequestBody.fromInputStream(body, request.contentLength),
                )
            }
        } catch (e: Exception) {
            failIfDependencyUnavailable(e)
            logger.error("Cloud file upload failed (objectKey={})", request.objectKey, e)
            throw AppException(ErrorCode.INTERNAL_ERROR, "클라우드 파일 업로드에 실패했습니다.")
        }

        return CloudStoragePort.UploadResult(
            objectKey = request.objectKey,
            checksumSha256 = digest.digest().toHex(),
        )
    }

    override fun open(objectKey: String): CloudStoragePort.StoredObject? {
        val client = requireClient()
        validateObjectKey(objectKey)
        CloudMediaMetrics.recordStorageOperation(meterRegistry, op = "get")

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
            if (StorageDependencyFailureClassifier.isExplicitMissingBucket(e)) {
                failIfDependencyUnavailable(e)
            }
            if (e.statusCode() == 404) return null
            failIfDependencyUnavailable(e)
            logger.error("Cloud file download failed (objectKey={})", objectKey, e)
            throw AppException(ErrorCode.INTERNAL_ERROR, "클라우드 파일을 불러오지 못했습니다.")
        }
    }

    override fun openRange(
        objectKey: String,
        range: LongRange,
    ): CloudStoragePort.StoredObject? {
        val client = requireClient()
        validateObjectKey(objectKey)
        CloudMediaMetrics.recordStorageOperation(meterRegistry, op = "get_range")

        return try {
            val response =
                client.getObject(
                    GetObjectRequest
                        .builder()
                        .bucket(properties.bucket)
                        .key(objectKey)
                        .range("bytes=${range.first}-${range.last}")
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
            if (StorageDependencyFailureClassifier.isExplicitMissingBucket(e)) {
                failIfDependencyUnavailable(e)
            }
            if (e.statusCode() == 404) return null
            failIfDependencyUnavailable(e)
            logger.error("Cloud file range download failed (objectKey={}, range={}-{})", objectKey, range.first, range.last, e)
            throw AppException(ErrorCode.INTERNAL_ERROR, "클라우드 파일을 불러오지 못했습니다.")
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
            failIfDependencyUnavailable(e)
            logger.error("Cloud multipart upload init failed (objectKey={})", request.objectKey, e)
            throw AppException(ErrorCode.INTERNAL_ERROR, "클라우드 대용량 업로드를 시작하지 못했습니다.")
        }
    }

    override fun uploadMultipartPart(request: CloudStoragePort.MultipartUploadPartRequest): CloudStoragePort.MultipartUploadPartResult {
        val client = requireClient()
        validateObjectKey(request.objectKey)

        return try {
            val response =
                request.inputStream.use { body ->
                    client.uploadPart(
                        UploadPartRequest
                            .builder()
                            .bucket(properties.bucket)
                            .key(request.objectKey)
                            .uploadId(request.uploadId)
                            .partNumber(request.partNumber)
                            .contentLength(request.contentLength)
                            .build(),
                        RequestBody.fromInputStream(body, request.contentLength),
                    )
                }

            CloudStoragePort.MultipartUploadPartResult(
                partNumber = request.partNumber,
                eTag = response.eTag(),
            )
        } catch (e: Exception) {
            failIfDependencyUnavailable(e)
            logger.error(
                "Cloud multipart part upload failed (objectKey={}, uploadId={}, partNumber={})",
                request.objectKey,
                request.uploadId,
                request.partNumber,
                e,
            )
            throw AppException(ErrorCode.INTERNAL_ERROR, "클라우드 대용량 업로드 조각 저장에 실패했습니다.")
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
            failIfDependencyUnavailable(e)
            logger.error(
                "Cloud multipart complete failed (objectKey={}, uploadId={})",
                request.objectKey,
                request.uploadId,
                e,
            )
            throw AppException(ErrorCode.INTERNAL_ERROR, "클라우드 대용량 업로드 완료에 실패했습니다.")
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
        } catch (_: NoSuchUploadException) {
            return
        } catch (e: S3Exception) {
            if (StorageDependencyFailureClassifier.isExplicitMissingBucket(e)) {
                failIfDependencyUnavailable(e)
            }
            if (isMissingMultipartUpload(e)) return
            failIfDependencyUnavailable(e)
            logger.error(
                "Cloud multipart abort failed (objectKey={}, uploadId={})",
                request.objectKey,
                request.uploadId,
                e,
            )
            throw AppException(ErrorCode.INTERNAL_ERROR, "클라우드 대용량 업로드 취소에 실패했습니다.")
        } catch (e: Exception) {
            failIfDependencyUnavailable(e)
            logger.error(
                "Cloud multipart abort failed (objectKey={}, uploadId={})",
                request.objectKey,
                request.uploadId,
                e,
            )
            throw AppException(ErrorCode.INTERNAL_ERROR, "클라우드 대용량 업로드 취소에 실패했습니다.")
        }
    }

    override fun head(objectKey: String): CloudStoragePort.ObjectHead? {
        val client = requireClient()
        validateObjectKey(objectKey)
        CloudMediaMetrics.recordStorageOperation(meterRegistry, op = "head")

        return try {
            val response =
                client.headObject(
                    HeadObjectRequest
                        .builder()
                        .bucket(properties.bucket)
                        .key(objectKey)
                        .build(),
                )
            CloudStoragePort.ObjectHead(
                objectKey = objectKey,
                contentLength = response.contentLength(),
                contentType = response.contentType(),
                eTag = response.eTag(),
            )
        } catch (_: NoSuchKeyException) {
            null
        } catch (e: S3Exception) {
            if (StorageDependencyFailureClassifier.isExplicitMissingBucket(e)) {
                failIfDependencyUnavailable(e)
            }
            if (e.statusCode() == 404) return null
            failIfDependencyUnavailable(e)
            logger.error("Cloud object head failed (objectKey={})", objectKey, e)
            throw AppException(ErrorCode.INTERNAL_ERROR, "클라우드 파일 메타데이터를 확인하지 못했습니다.")
        }
    }

    override fun listObjects(
        prefix: String,
        limit: Int,
    ): CloudStoragePort.StoredObjectListing {
        val normalizedPrefix = normalizeListPrefix(prefix)
        val safeLimit = limit.coerceIn(1, MAX_LIST_OBJECTS)
        val client = requireClient()
        val objects = mutableListOf<CloudStoragePort.StoredObjectSummary>()
        var continuationToken: String? = null
        var hasMore: Boolean

        try {
            do {
                val remaining = safeLimit - objects.size
                val response =
                    client.listObjectsV2(
                        ListObjectsV2Request
                            .builder()
                            .bucket(properties.bucket)
                            .prefix(normalizedPrefix)
                            .maxKeys(remaining.coerceAtMost(S3_PAGE_SIZE))
                            .continuationToken(continuationToken)
                            .build(),
                    )
                val responseObjects = response.contents()

                responseObjects.forEach { s3Object ->
                    if (objects.size < safeLimit) {
                        objects +=
                            CloudStoragePort.StoredObjectSummary(
                                objectKey = s3Object.key(),
                                size = s3Object.size(),
                                lastModified = s3Object.lastModified(),
                            )
                    }
                }

                continuationToken = response.nextContinuationToken()
                hasMore = response.isTruncated == true || continuationToken != null || responseObjects.size > remaining
            } while (objects.size < safeLimit && continuationToken != null)
        } catch (e: Exception) {
            failIfDependencyUnavailable(e)
            logger.error("Cloud object list failed (prefix={})", normalizedPrefix, e)
            throw AppException(ErrorCode.INTERNAL_ERROR, "클라우드 객체 목록을 조회하지 못했습니다.")
        }

        return CloudStoragePort.StoredObjectListing(
            objects = objects,
            // hasMore already tracks S3 truncation / leftover page keys even when
            // collected size is below the caller limit (e.g. truncated page with null token).
            isTruncated = hasMore,
        )
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
            if (StorageDependencyFailureClassifier.isExplicitMissingBucket(e)) {
                failIfDependencyUnavailable(e)
            }
            if (e.statusCode() == 404) return
            failIfDependencyUnavailable(e)
            logger.error("Cloud file delete failed (objectKey={})", objectKey, e)
            throw AppException(ErrorCode.INTERNAL_ERROR, "클라우드 파일 삭제에 실패했습니다.")
        }
    }

    internal fun probeStorageDependency(): StorageDependencyProbeResult {
        if (!properties.enabled) {
            initErrorMessage = null
            return StorageDependencyProbeResult.disabled()
        }

        return synchronized(initLock) {
            val configuration =
                try {
                    resolveStorageConfiguration()
                } catch (error: IllegalArgumentException) {
                    val reason = StorageDependencyFailureClassifier.classify(error)
                    initErrorMessage = "클라우드 스토리지 dependency 사용 불가 (reason=${reason.wireValue})"
                    logger.error("Cloud storage configuration rejected (reason={})", reason.wireValue)
                    return@synchronized StorageDependencyProbeResult.down(reason)
                }

            val client =
                try {
                    s3Client ?: buildClient(configuration)
                } catch (error: Exception) {
                    val reason = StorageDependencyFailureClassifier.classify(error)
                    initErrorMessage = "클라우드 스토리지 dependency 사용 불가 (reason=${reason.wireValue})"
                    logger.error("Cloud storage client initialization failed (reason={})", reason.wireValue)
                    return@synchronized StorageDependencyProbeResult.down(reason, configuration.credentialVersion)
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
                StorageDependencyProbeResult.ready(configuration.credentialVersion)
            } catch (error: Exception) {
                val reason = StorageDependencyFailureClassifier.classify(error)
                initErrorMessage = "클라우드 스토리지 dependency 사용 불가 (reason=${reason.wireValue})"
                logger.error("Cloud storage probe failed (reason={})", reason.wireValue)
                StorageDependencyProbeResult.down(reason, configuration.credentialVersion)
            }
        }
    }

    private fun requireClient(): S3Client {
        if (!properties.enabled) throw AppException(ErrorCode.SERVICE_UNAVAILABLE, "클라우드 스토리지가 비활성화되어 있습니다.")

        if (s3Client == null || initErrorMessage != null) {
            probeStorageDependency()
        }

        initErrorMessage?.let { throw AppException(ErrorCode.SERVICE_UNAVAILABLE, it) }

        return s3Client ?: throw AppException(ErrorCode.SERVICE_UNAVAILABLE, "클라우드 스토리지가 아직 준비되지 않았습니다.")
    }

    private fun failIfDependencyUnavailable(error: Throwable) {
        val reason = StorageDependencyFailureClassifier.classify(error)
        if (reason == StorageDependencyFailureReason.OTHER) return

        val safeMessage = "클라우드 스토리지 dependency 사용 불가 (reason=${reason.wireValue})"
        initErrorMessage = safeMessage
        logger.error("Cloud storage operation failed (reason={})", reason.wireValue)
        throw AppException(ErrorCode.SERVICE_UNAVAILABLE, safeMessage)
    }

    private fun buildClient(configuration: ValidatedStorageConfiguration): S3Client =
        S3Client
            .builder()
            .httpClientBuilder(UrlConnectionHttpClient.builder())
            .endpointOverride(configuration.endpoint)
            .region(Region.of(configuration.region))
            .credentialsProvider(
                StaticCredentialsProvider.create(
                    AwsBasicCredentials.create(configuration.accessKey, configuration.secretKey),
                ),
            ).forcePathStyle(properties.pathStyleAccess)
            .build()

    private fun resolveStorageConfiguration(): ValidatedStorageConfiguration =
        StorageRuntimeConfigurationValidator.validate(
            endpoint = properties.endpoint,
            region = properties.region,
            bucket = properties.bucket,
            accessKey = properties.accessKey,
            secretKey = properties.secretKey,
            credentialVersion = properties.credentialVersion,
        )

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
            throw AppException(ErrorCode.BAD_REQUEST, "유효하지 않은 클라우드 파일 경로입니다.")
        }
    }

    private fun normalizeListPrefix(prefix: String): String {
        val allowedPrefix =
            properties.cloudKeyPrefix
                .trim()
                .trim('/')
                .ifBlank { "cloud" }
        val normalized =
            prefix
                .trim()
                .trimStart('/')
                .let { if (it.isBlank() || it.endsWith("/")) it else "$it/" }
        if (
            normalized.contains("..") ||
            !(normalized == "$allowedPrefix/" || normalized.startsWith("$allowedPrefix/"))
        ) {
            throw AppException(ErrorCode.BAD_REQUEST, "유효하지 않은 클라우드 파일 경로입니다.")
        }
        return normalized
    }

    private fun decodeStoredOriginalFilename(value: String?): String? {
        val encoded = value?.trim().orEmpty()
        if (encoded.isBlank()) return null
        return runCatching { URLDecoder.decode(encoded, StandardCharsets.UTF_8) }.getOrNull()
    }

    private fun isMissingMultipartUpload(error: S3Exception): Boolean {
        if (error.statusCode() == 404) return true
        return error.awsErrorDetails()?.errorCode().equals("NoSuchUpload", ignoreCase = true)
    }

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

    companion object {
        private const val MAX_LIST_OBJECTS = 1_000
        private const val S3_PAGE_SIZE = 1_000
    }
}
