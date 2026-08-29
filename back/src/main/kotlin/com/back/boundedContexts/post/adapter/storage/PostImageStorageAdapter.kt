package com.back.boundedContexts.post.adapter.storage

import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.health.StorageDependencyDownCache
import com.back.global.storage.health.StorageDependencyFailureClassifier
import com.back.global.storage.health.StorageDependencyOperationGuard
import com.back.global.storage.health.StorageDependencyProbeResult
import com.back.global.storage.health.StorageDependencyProber
import com.back.global.storage.health.StorageRuntimeConfigurationValidator
import com.back.global.storage.health.ValidatedStorageConfiguration
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception
import java.io.InputStream
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID

/**
 * PostImageStorageAdapter는 파일 스토리지 연동을 담당하는 어댑터입니다.
 * 업로드/URL 생성/삭제와 같은 저장소 I/O를 애플리케이션 계층에 제공합니다.
 */
@Service
class PostImageStorageAdapter(
    private val properties: PostImageStorageProperties,
) : PostImageStoragePort {
    private val datePathFormatter = DateTimeFormatter.ofPattern("yyyy/MM")
    private val logger = LoggerFactory.getLogger(javaClass)
    private val initLock = Any()
    private val dependencyDownCache = StorageDependencyDownCache()
    private val imageAdmissionValidator = PostImageAdmissionValidator()

    @Volatile
    private var s3Client: S3Client? = null

    @Volatile
    private var initErrorMessage: String? = null

    @PostConstruct
    fun initializeDependency() {
        probeStorageDependency()
    }

    private fun probeStorageDependency(): StorageDependencyProbeResult =
        synchronized(initLock) {
            dependencyDownCache.reusableDown()?.let { return@synchronized it }
            val outcome =
                StorageDependencyProber.probe(
                    enabled = properties.enabled,
                    existingClient = s3Client,
                    forcePathStyle = properties.pathStyleAccess,
                    configurationProvider = ::resolveStorageConfiguration,
                )
            s3Client = outcome.client
            initErrorMessage = outcome.unavailableMessage("이미지 스토리지", logger)
            dependencyDownCache.record(outcome.result)
            outcome.result
        }

    override fun uploadPostImage(request: PostImageStoragePort.UploadImageRequest): String {
        validateUploadContentLength(
            contentLength = request.contentLength,
            emptyMessage = "이미지 파일이 비어 있습니다.",
            oversizedMessage = "이미지 파일은 ${properties.maxFileSizeBytes / (1024 * 1024)}MB 이하여야 합니다.",
        )

        val preparedUpload = prepareRepeatableUpload(request.inputStream, request.contentLength)
        try {
            val validatedImage = imageAdmissionValidator.validate(preparedUpload.path, request.contentType)
            val key = buildObjectKeyWithExtension(validatedImage.extension)
            val client = requireClient()

            try {
                putObject(
                    client = client,
                    objectKey = key,
                    contentType = validatedImage.contentType,
                    uploadPath = preparedUpload.path,
                    contentLength = preparedUpload.contentLength,
                    originalFilename = request.originalFilename,
                )
            } catch (e: Exception) {
                failIfDependencyUnavailable(e)
                logger.error("Post image upload failed", e)
                throw AppException(ErrorCode.INTERNAL_ERROR, "이미지 업로드에 실패했습니다.")
            }

            return key
        } finally {
            preparedUpload.deleteQuietly()
        }
    }

    override fun getPostImage(objectKey: String): PostImageStoragePort.StoredObject? = getStoredObject(objectKey, "이미지를 불러오지 못했습니다.")

    private fun getStoredObject(
        objectKey: String,
        errorMessage: String,
    ): PostImageStoragePort.StoredObject? {
        validateObjectKey(objectKey)
        val client = requireClient()

        return try {
            val response =
                client.getObject(
                    GetObjectRequest
                        .builder()
                        .bucket(properties.bucket)
                        .key(objectKey)
                        .build(),
                )
            PostImageStoragePort.StoredObject(
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
            logger.error("Post image download failed (objectKey={})", objectKey, e)
            throw AppException(ErrorCode.INTERNAL_ERROR, errorMessage)
        }
    }

    override fun deletePostImage(objectKey: String) {
        deleteObject(objectKey, "이미지 삭제에 실패했습니다.")
    }

    override fun deletePostFile(objectKey: String) {
        deleteObject(objectKey, "첨부 파일 삭제에 실패했습니다.")
    }

    override fun listObjects(
        prefix: String,
        limit: Int,
    ): PostImageStoragePort.StoredObjectListing {
        val normalizedPrefix = normalizeObjectPrefix(prefix)
        val safeLimit = limit.coerceIn(1, MAX_LIST_OBJECTS)
        val client = requireClient()
        val objects = mutableListOf<PostImageStoragePort.StoredObjectSummary>()
        var continuationToken: String? = null
        var hasMore: Boolean

        do {
            val remaining = safeLimit - objects.size
            val response =
                try {
                    client.listObjectsV2(
                        ListObjectsV2Request
                            .builder()
                            .bucket(properties.bucket)
                            .prefix(normalizedPrefix)
                            .maxKeys(remaining.coerceAtMost(S3_PAGE_SIZE))
                            .continuationToken(continuationToken)
                            .build(),
                    )
                } catch (e: Exception) {
                    failIfDependencyUnavailable(e)
                    logger.error("Post image list failed (prefix={})", normalizedPrefix, e)
                    throw AppException(ErrorCode.INTERNAL_ERROR, "이미지 목록 조회에 실패했습니다.")
                }
            val responseObjects = response.contents()

            responseObjects.forEach { s3Object ->
                if (objects.size < safeLimit) {
                    objects +=
                        PostImageStoragePort.StoredObjectSummary(
                            objectKey = s3Object.key(),
                            size = s3Object.size(),
                        )
                }
            }

            continuationToken = response.nextContinuationToken()
            hasMore = response.isTruncated == true || continuationToken != null || responseObjects.size > remaining
        } while (objects.size < safeLimit && continuationToken != null)

        return PostImageStoragePort.StoredObjectListing(
            objects = objects,
            isTruncated = hasMore && objects.size >= safeLimit,
        )
    }

    private fun deleteObject(
        objectKey: String,
        errorMessage: String,
    ) {
        validateObjectKey(objectKey)
        val client = requireClient()

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
            logger.error("Post image delete failed (objectKey={})", objectKey, e)
            throw AppException(ErrorCode.INTERNAL_ERROR, errorMessage)
        }
    }

    private fun putObject(
        client: S3Client,
        objectKey: String,
        contentType: String,
        uploadPath: Path,
        contentLength: Long,
        originalFilename: String?,
    ) {
        val metadata =
            originalFilename
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?.let {
                    mapOf(
                        "original-filename" to
                            URLEncoder
                                .encode(it, StandardCharsets.UTF_8)
                                .replace("+", "%20"),
                    )
                }
                ?: emptyMap()

        client.putObject(
            PutObjectRequest
                .builder()
                .bucket(properties.bucket)
                .key(objectKey)
                .contentType(contentType)
                .contentLength(contentLength)
                .metadata(metadata)
                .build(),
            RequestBody.fromFile(uploadPath),
        )
    }

    private fun prepareRepeatableUpload(
        inputStream: InputStream,
        expectedContentLength: Long,
    ): PreparedUpload {
        val path = Files.createTempFile("post-upload-", ".tmp")
        var totalBytes = 0L

        try {
            inputStream.use { source ->
                Files.newOutputStream(path).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = source.read(buffer)
                        if (read == -1) break
                        totalBytes += read
                        if (totalBytes > properties.maxFileSizeBytes) {
                            throw AppException(ErrorCode.BAD_REQUEST, "업로드 파일 크기가 허용 범위를 초과했습니다.")
                        }
                        output.write(buffer, 0, read)
                    }
                }
            }

            if (totalBytes != expectedContentLength) {
                throw AppException(ErrorCode.BAD_REQUEST, "업로드 파일 크기 정보가 올바르지 않습니다.")
            }

            return PreparedUpload(path = path, contentLength = totalBytes)
        } catch (e: Exception) {
            Files.deleteIfExists(path)
            throw e
        }
    }

    private fun validateUploadContentLength(
        contentLength: Long,
        emptyMessage: String,
        oversizedMessage: String,
    ) {
        if (contentLength <= 0) throw AppException(ErrorCode.BAD_REQUEST, emptyMessage)
        if (contentLength > properties.maxFileSizeBytes) {
            throw AppException(ErrorCode.BAD_REQUEST, oversizedMessage)
        }
    }

    private data class PreparedUpload(
        val path: Path,
        val contentLength: Long,
    ) {
        fun deleteQuietly() {
            runCatching { Files.deleteIfExists(path) }
        }
    }

    private fun ensureStorageEnabled() {
        if (!properties.enabled) throw AppException(ErrorCode.SERVICE_UNAVAILABLE, "이미지 스토리지가 비활성화되어 있습니다.")
    }

    private fun failIfDependencyUnavailable(error: Throwable) {
        StorageDependencyOperationGuard.failIfUnavailable(error, "이미지 스토리지", logger) { reason, message ->
            synchronized(initLock) {
                initErrorMessage = message
                dependencyDownCache.record(
                    StorageDependencyProbeResult.down(
                        reason,
                        properties.credentialVersion.trim().takeIf(String::isNotEmpty),
                    ),
                )
            }
        }
    }

    private fun requireClient(): S3Client {
        ensureStorageEnabled()

        if (s3Client == null || initErrorMessage != null) {
            probeStorageDependency()
        }

        initErrorMessage?.let {
            throw AppException(ErrorCode.SERVICE_UNAVAILABLE, it)
        }

        return s3Client ?: throw AppException(ErrorCode.SERVICE_UNAVAILABLE, "이미지 스토리지가 아직 준비되지 않았습니다.")
    }

    private fun resolveStorageConfiguration(): ValidatedStorageConfiguration =
        StorageRuntimeConfigurationValidator.validate(
            endpoint = properties.endpoint,
            region = properties.region,
            bucket = properties.bucket,
            accessKey = properties.accessKey,
            secretKey = properties.secretKey,
            credentialVersion = properties.credentialVersion,
        )

    private fun buildObjectKeyWithExtension(extension: String): String {
        val datePath = LocalDate.now().format(datePathFormatter)
        val prefix = resolvedKeyPrefix()
        val uuid = UUID.randomUUID().toString()
        return "$prefix/$datePath/$uuid$extension"
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
        val prefix = resolvedKeyPrefix()
        if (
            objectKey.isBlank() ||
            objectKey.contains("..") ||
            objectKey.startsWith("/") ||
            !objectKey.startsWith("$prefix/")
        ) {
            throw AppException(ErrorCode.BAD_REQUEST, "유효하지 않은 이미지 경로입니다.")
        }
    }

    private fun normalizeObjectPrefix(prefix: String): String {
        val normalized = prefix.trim().trimStart('/')
        val allowedPrefix = resolvedKeyPrefix()
        if (
            normalized.isBlank() ||
            normalized.contains("..") ||
            normalized != allowedPrefix &&
            !normalized.startsWith("$allowedPrefix/")
        ) {
            throw AppException(ErrorCode.BAD_REQUEST, "유효하지 않은 이미지 경로입니다.")
        }
        return if (normalized.endsWith("/")) normalized else "$normalized/"
    }

    /** blank/whitespace keyPrefix는 cloud 어댑터와 같이 안전 기본값으로 강제한다. */
    private fun resolvedKeyPrefix(): String =
        properties.keyPrefix
            .trim()
            .trim('/')
            .ifBlank { "posts" }

    private fun decodeStoredOriginalFilename(value: String?): String? {
        val encoded = value?.trim().orEmpty()
        if (encoded.isBlank()) return null
        return runCatching { URLDecoder.decode(encoded, StandardCharsets.UTF_8) }.getOrNull()
    }

    companion object {
        private const val MAX_LIST_OBJECTS = 1_000
        private const val S3_PAGE_SIZE = 1_000
    }
}
