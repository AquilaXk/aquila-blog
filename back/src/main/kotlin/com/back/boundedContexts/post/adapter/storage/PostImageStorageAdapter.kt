package com.back.boundedContexts.post.adapter.storage

import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.exception.application.AppException
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception
import java.io.BufferedInputStream
import java.io.InputStream
import java.net.URI
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

    @Volatile
    private var s3Client: S3Client? = null

    @Volatile
    private var initErrorMessage: String? = null

    @PostConstruct
    fun initializeBucket() {
        initializeStorage(forceRetry = true)
    }

    // 앱 부팅 시점에는 스토리지가 아직 준비되지 않을 수 있다(컨테이너 기동 순서 경쟁).
    // 백엔드 재시작 없이 요청 자체가 회복되도록 이 메서드는 재시도 가능해야 한다.

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

    override fun uploadPostImage(request: PostImageStoragePort.UploadImageRequest): String {
        validateUploadContentLength(
            contentLength = request.contentLength,
            emptyMessage = "이미지 파일이 비어 있습니다.",
            oversizedMessage = "이미지 파일은 ${properties.maxFileSizeBytes / (1024 * 1024)}MB 이하여야 합니다.",
        )

        val preparedUpload = prepareRepeatableUpload(request.inputStream, request.contentLength)
        try {
            val signature =
                Files.newInputStream(preparedUpload.path).use { uploadStream ->
                    uploadStream.asResettableStream().use { resettableStream ->
                        resettableStream.mark(IMAGE_SIGNATURE_MAX_BYTES)
                        resettableStream.readNBytes(IMAGE_SIGNATURE_MAX_BYTES)
                    }
                }

            val declaredContentType = normalizeDeclaredContentType(request.contentType)
            val detectedType = detectImageContentType(signature)
            if (detectedType == null || detectedType !in allowedContentTypes) {
                throw AppException("400-1", "지원하지 않는 이미지 형식입니다.")
            }

            // Browser/OS에 따라 image/x-png 등 별칭이 전달될 수 있어 선언 타입은 정규화 후 참고한다.
            // 단, 정규화된 선언 타입이 명확히 존재하고 감지 결과와 다르면 위장 업로드로 보고 차단한다.
            if (declaredContentType != null &&
                declaredContentType in allowedContentTypes &&
                declaredContentType != detectedType
            ) {
                throw AppException("400-1", "지원하지 않는 이미지 형식입니다.")
            }

            val key = buildObjectKey(request.originalFilename)
            val client = requireClient()

            try {
                putObject(
                    client = client,
                    objectKey = key,
                    contentType = detectedType,
                    uploadPath = preparedUpload.path,
                    contentLength = preparedUpload.contentLength,
                    originalFilename = request.originalFilename,
                )
            } catch (e: Exception) {
                logger.error("Post image upload failed", e)
                throw AppException("500-1", "이미지 업로드에 실패했습니다.")
            }

            return key
        } finally {
            preparedUpload.deleteQuietly()
        }
    }

    override fun uploadPostFile(request: PostImageStoragePort.UploadFileRequest): String {
        validateUploadContentLength(
            contentLength = request.contentLength,
            emptyMessage = "첨부 파일이 비어 있습니다.",
            oversizedMessage = "첨부 파일은 ${properties.maxFileSizeBytes / (1024 * 1024)}MB 이하여야 합니다.",
        )

        val key = buildObjectKey(request.originalFilename)
        val contentType = normalizeDeclaredContentType(request.contentType) ?: "application/octet-stream"

        val preparedUpload = prepareRepeatableUpload(request.inputStream, request.contentLength)
        try {
            val client = requireClient()
            try {
                putObject(
                    client = client,
                    objectKey = key,
                    contentType = contentType,
                    uploadPath = preparedUpload.path,
                    contentLength = preparedUpload.contentLength,
                    originalFilename = request.originalFilename,
                )
            } catch (e: Exception) {
                logger.error("Post file upload failed", e)
                throw AppException("500-1", "첨부 파일 업로드에 실패했습니다.")
            }
        } finally {
            preparedUpload.deleteQuietly()
        }

        return key
    }

    override fun getPostImage(objectKey: String): PostImageStoragePort.StoredObject? = getStoredObject(objectKey, "이미지를 불러오지 못했습니다.")

    override fun getPostFile(objectKey: String): PostImageStoragePort.StoredObject? = getStoredObject(objectKey, "첨부 파일을 불러오지 못했습니다.")

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
            if (e.statusCode() == 404) return null
            logger.error("Post image download failed (objectKey={})", objectKey, e)
            throw AppException("500-1", errorMessage)
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
        var hasMore = false

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

            response.contents().forEach { s3Object ->
                if (objects.size < safeLimit) {
                    objects +=
                        PostImageStoragePort.StoredObjectSummary(
                            objectKey = s3Object.key(),
                            size = s3Object.size(),
                        )
                }
            }

            continuationToken = response.nextContinuationToken()
            hasMore = response.isTruncated == true || continuationToken != null
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
            if (e.statusCode() == 404) return
            logger.error("Post image delete failed (objectKey={})", objectKey, e)
            throw AppException("500-1", errorMessage)
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
                            throw AppException("400-1", "업로드 파일 크기가 허용 범위를 초과했습니다.")
                        }
                        output.write(buffer, 0, read)
                    }
                }
            }

            if (totalBytes != expectedContentLength) {
                throw AppException("400-1", "업로드 파일 크기 정보가 올바르지 않습니다.")
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
        if (contentLength <= 0) throw AppException("400-1", emptyMessage)
        if (contentLength > properties.maxFileSizeBytes) {
            throw AppException("400-1", oversizedMessage)
        }
    }

    private fun InputStream.asResettableStream(): InputStream = if (markSupported()) this else BufferedInputStream(this)

    private data class PreparedUpload(
        val path: Path,
        val contentLength: Long,
    ) {
        fun deleteQuietly() {
            runCatching { Files.deleteIfExists(path) }
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
        val prefix = properties.keyPrefix.trim().trim('/')
        if (
            objectKey.isBlank() ||
            objectKey.contains("..") ||
            objectKey.startsWith("/") ||
            (prefix.isNotBlank() && !objectKey.startsWith("$prefix/"))
        ) {
            throw AppException("400-1", "유효하지 않은 이미지 경로입니다.")
        }
    }

    private fun normalizeObjectPrefix(prefix: String): String {
        val normalized = prefix.trim().trimStart('/')
        val allowedPrefix =
            properties.keyPrefix
                .trim()
                .trim('/')
        if (allowedPrefix.isBlank()) {
            if (normalized.contains("..")) {
                throw AppException("400-1", "유효하지 않은 이미지 경로입니다.")
            }
            return if (normalized.isBlank() || normalized.endsWith("/")) normalized else "$normalized/"
        }
        if (
            normalized.isBlank() ||
            normalized.contains("..") ||
            normalized != allowedPrefix &&
            !normalized.startsWith("$allowedPrefix/")
        ) {
            throw AppException("400-1", "유효하지 않은 이미지 경로입니다.")
        }
        return if (normalized.endsWith("/")) normalized else "$normalized/"
    }

    private fun decodeStoredOriginalFilename(value: String?): String? {
        val encoded = value?.trim().orEmpty()
        if (encoded.isBlank()) return null
        return runCatching { URLDecoder.decode(encoded, StandardCharsets.UTF_8) }.getOrNull()
    }

    companion object {
        private val allowedContentTypes =
            setOf(
                "image/jpeg",
                "image/png",
                "image/gif",
                "image/webp",
            )

        private val contentTypeAliases =
            mapOf(
                "image/jpg" to "image/jpeg",
                "image/pjpeg" to "image/jpeg",
                "image/x-png" to "image/png",
                "image/x-webp" to "image/webp",
            )

        private val ENV_REFERENCE_REGEX = Regex("^\\$\\{([A-Za-z_][A-Za-z0-9_]*)(?::-(.*))?}$")
        private const val IMAGE_SIGNATURE_MAX_BYTES = 16
        private const val MAX_LIST_OBJECTS = 1_000
        private const val S3_PAGE_SIZE = 1_000
    }

    private fun normalizeDeclaredContentType(raw: String?): String? {
        val normalized =
            raw
                ?.substringBefore(";")
                ?.trim()
                ?.lowercase()
                .orEmpty()

        if (normalized.isBlank()) return null
        return contentTypeAliases[normalized] ?: normalized
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
