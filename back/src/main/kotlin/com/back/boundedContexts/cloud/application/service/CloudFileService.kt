package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.adapter.web.ApiV1AdmCloudController.BulkDeleteCloudFilesResBody
import com.back.boundedContexts.cloud.adapter.web.ApiV1AdmCloudController.CloudFileFacetsResBody
import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.application.ImageUploadAdmissionValidator
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import com.fasterxml.jackson.annotation.JsonIgnore
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.transaction.support.TransactionTemplate
import java.io.BufferedInputStream
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.time.Clock
import java.time.Instant

data class CloudFileDto(
    val id: Long,
    val ownerMemberId: Long,
    val originalFilename: String,
    val contentType: String,
    val byteSize: Long,
    val mediaKind: CloudFileMediaKind,
    val folderPath: String,
    val createdAt: Instant,
    val modifiedAt: Instant,
    @get:JsonIgnore
    val objectKey: String = "",
    @get:JsonIgnore
    val checksumSha256: String? = null,
)

data class CloudFileContent(
    val file: CloudFileDto,
    val storedObject: CloudStoragePort.StoredObject,
)

/**
 * 참조 구현: strapi/strapi (MIT) packages/core/upload & payloadcms/payload (MIT)
 * 클라우드 파일 업로드, 조회, 패싯 집계, 일괄 삭제 서비스.
 */
@Service
class CloudFileService(
    private val cloudFileRepository: CloudFileRepositoryPort,
    private val cloudStoragePort: CloudStoragePort,
    private val cloudStorageProperties: CloudStorageProperties = CloudStorageProperties(),
    private val clock: Clock = Clock.systemUTC(),
    private val transactionManager: PlatformTransactionManager? = null,
    private val imageAdmissionValidator: ImageUploadAdmissionValidator = ImageUploadAdmissionValidator(),
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    fun upload(
        ownerMemberId: Long,
        originalFilename: String?,
        clientOriginalFilename: String? = null,
        contentType: String?,
        inputStream: InputStream,
        contentLength: Long,
        folderPath: String?,
    ): CloudFileDto =
        inputStream.use { source ->
            if (contentLength <= 0) throw AppException(ErrorCode.BAD_REQUEST, "클라우드 파일이 비어 있습니다.")
            val normalizedFolderPath = normalizeFolderPath(folderPath)
            val safeFilename =
                normalizeFilename(
                    clientOriginalFilename?.takeIf(String::isNotBlank) ?: originalFilename,
                    "cloud-file",
                )
            val tempFile = copyToTempFile(source, contentLength)
            try {
                val detected = detectContent(tempFile, contentType, safeFilename)
                validateFileSize(contentLength, detected)
                val validatedContentType =
                    when {
                        detected.mediaKind == CloudFileMediaKind.PHOTO && detected.contentType == SVG_CONTENT_TYPE ->
                            detected.contentType
                        detected.mediaKind == CloudFileMediaKind.PHOTO ->
                            imageAdmissionValidator
                                .validate(
                                    tempFile,
                                    detected.contentType,
                                    ImageUploadAdmissionValidator.ImageValidationPolicy.CLOUD_PHOTO,
                                ).contentType
                        else -> detected.contentType
                    }
                val objectKey =
                    buildObjectKey(
                        ownerMemberId = ownerMemberId,
                        folderPath = normalizedFolderPath,
                        originalFilename = safeFilename,
                        keyPrefix = cloudStorageProperties.cloudKeyPrefix,
                        now = clock.instant(),
                    )

                val uploadResult =
                    Files.newInputStream(tempFile).use { uploadStream ->
                        cloudStoragePort.upload(
                            CloudStoragePort.UploadRequest(
                                objectKey = objectKey,
                                inputStream = uploadStream,
                                contentLength = contentLength,
                                contentType = validatedContentType,
                                originalFilename = safeFilename,
                            ),
                        )
                    }

                val saved =
                    try {
                        executeWriteTransaction {
                            cloudFileRepository.save(
                                CloudFile.create(
                                    ownerMemberId = ownerMemberId,
                                    objectKey = uploadResult.objectKey,
                                    originalFilename = safeFilename,
                                    contentType = validatedContentType,
                                    byteSize = contentLength,
                                    mediaKind = detected.mediaKind,
                                    folderPath = normalizedFolderPath,
                                    checksumSha256 = uploadResult.checksumSha256,
                                ),
                            )
                        }
                    } catch (ex: Throwable) {
                        runCatching { cloudStoragePort.delete(uploadResult.objectKey) }
                        throw ex
                    }
                logger.info(
                    "cloud_file_upload_completed fileId={} actorId={}",
                    saved.id,
                    ownerMemberId,
                )

                return saved.toDto(clock)
            } finally {
                deleteTempFileQuietly(tempFile)
            }
        }

    @Transactional(readOnly = true)
    fun listFiles(
        ownerMemberId: Long,
        folderPath: String?,
        keyword: String?,
        mediaKind: CloudFileMediaKind?,
    ): List<CloudFileDto> =
        cloudFileRepository
            .findActiveByOwner(
                ownerMemberId = ownerMemberId,
                folderPath = normalizeOptionalFolderPath(folderPath),
                keyword = keyword?.trim()?.takeIf(String::isNotBlank),
                mediaKind = mediaKind,
            ).map { it.toDto(clock) }

    @Transactional(readOnly = true)
    fun get(
        ownerMemberId: Long,
        fileId: Long,
    ): CloudFileDto = findActiveOwnedFile(fileId, ownerMemberId).toDto(clock)

    fun openContent(
        ownerMemberId: Long,
        fileId: Long,
    ): CloudFileContent {
        val fileDto = executeReadOnlyTransaction { findActiveOwnedFile(fileId, ownerMemberId).toDto(clock) }
        val storedObject =
            cloudStoragePort.open(fileDto.objectKey)
                ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")

        return CloudFileContent(
            file = fileDto,
            storedObject = storedObject,
        )
    }

    fun openContentRange(
        file: CloudFileDto,
        range: LongRange,
    ): CloudFileContent {
        val storedObject =
            cloudStoragePort.openRange(file.objectKey, range)
                ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")

        return CloudFileContent(
            file = file,
            storedObject = storedObject,
        )
    }

    fun openContentRange(
        ownerMemberId: Long,
        fileId: Long,
        range: LongRange,
    ): CloudFileContent {
        val fileDto = executeReadOnlyTransaction { findActiveOwnedFile(fileId, ownerMemberId).toDto(clock) }
        return openContentRange(fileDto, range)
    }

    @Transactional
    fun updateFile(
        ownerMemberId: Long,
        fileId: Long,
        originalFilename: String?,
        folderPath: String?,
    ): CloudFileDto {
        val file = findActiveOwnedFile(fileId, ownerMemberId)
        val resolvedFilename =
            originalFilename?.let { rawName ->
                resolveUpdatedFilename(rawName, file.originalFilename)
            } ?: file.originalFilename
        val resolvedFolderPath = folderPath?.let(::normalizeFolderPath) ?: file.folderPath
        file.updateMetadata(resolvedFilename, resolvedFolderPath)
        return cloudFileRepository.save(file).toDto(clock)
    }

    @Transactional
    fun delete(
        ownerMemberId: Long,
        fileId: Long,
    ) {
        val file = findActiveOwnedFile(fileId, ownerMemberId)
        val objectKey = file.objectKey
        file.markDeleted(clock.instant())
        cloudFileRepository.save(file)
        deleteObjectAfterCommit(objectKey)
        logger.info("cloud_file_delete_completed fileId={} actorId={}", fileId, ownerMemberId)
    }

    @Transactional(readOnly = true)
    fun getFacets(ownerMemberId: Long): CloudFileFacetsResBody = cloudFileRepository.getFacets(ownerMemberId)

    @Transactional
    fun bulkDelete(
        ownerMemberId: Long,
        fileIds: List<Long>,
    ): BulkDeleteCloudFilesResBody {
        val distinctIds = fileIds.distinct()
        if (distinctIds.isEmpty()) {
            return BulkDeleteCloudFilesResBody(emptyList(), 0)
        }
        val activeFiles = cloudFileRepository.findActiveByIdsAndOwner(distinctIds, ownerMemberId)
        if (activeFiles.isEmpty()) {
            return BulkDeleteCloudFilesResBody(emptyList(), 0)
        }
        val now = clock.instant()
        val deletedIds = activeFiles.map { it.id }
        val objectKeys = activeFiles.map { it.objectKey }
        cloudFileRepository.bulkSoftDelete(deletedIds, ownerMemberId, now)
        deleteObjectsAfterCommit(objectKeys)
        logger.info("cloud_files_bulk_delete_completed count={} actorId={}", deletedIds.size, ownerMemberId)
        return BulkDeleteCloudFilesResBody(
            deletedIds = deletedIds,
            deletedCount = deletedIds.size,
        )
    }

    private fun deleteObjectsAfterCommit(objectKeys: List<String>) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            objectKeys.forEach { key -> runCatching { cloudStoragePort.delete(key) } }
            return
        }

        TransactionSynchronizationManager.registerSynchronization(
            object : TransactionSynchronization {
                override fun afterCommit() {
                    objectKeys.forEach { key ->
                        runCatching { cloudStoragePort.delete(key) }
                            .onFailure {
                                logger.error(
                                    "Cloud file object bulk delete failed after metadata commit (objectKey={})",
                                    key,
                                    it,
                                )
                            }
                    }
                }
            },
        )
    }

    private fun findActiveOwnedFile(
        fileId: Long,
        ownerMemberId: Long,
    ): CloudFile =
        cloudFileRepository.findActiveByIdAndOwner(fileId, ownerMemberId)
            ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")

    private fun resolveUpdatedFilename(
        newFilename: String,
        currentFilename: String,
    ): String {
        val baseFallback = currentFilename.substringBeforeLast('.', currentFilename)
        val normalized = normalizeFilename(newFilename, baseFallback)
        val existingExtension = currentFilename.substringAfterLast('.', "")
        if (existingExtension.isEmpty() || normalized.endsWith(".$existingExtension", ignoreCase = true)) {
            return normalized
        }
        return normalizeFilename("$normalized.$existingExtension", currentFilename)
    }

    private fun deleteObjectAfterCommit(objectKey: String) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            cloudStoragePort.delete(objectKey)
            return
        }

        TransactionSynchronizationManager.registerSynchronization(
            object : TransactionSynchronization {
                override fun afterCommit() {
                    runCatching { cloudStoragePort.delete(objectKey) }
                        .onFailure {
                            logger.error(
                                "Cloud file object delete failed after metadata commit (objectKey={})",
                                objectKey,
                                it,
                            )
                        }
                }
            },
        )
    }

    private fun normalizeOptionalFolderPath(folderPath: String?): String? = normalizeFolderPath(folderPath).takeIf(String::isNotBlank)

    private fun copyToTempFile(
        inputStream: InputStream,
        expectedLength: Long,
    ): Path {
        val tempFile = Files.createTempFile("cloud-upload-", ".tmp")
        try {
            var total = 0L
            inputStream.use { input ->
                Files.newOutputStream(tempFile).use { output ->
                    val buffer = ByteArray(STREAM_COPY_BUFFER_SIZE)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        total += read
                        if (total > expectedLength) {
                            throw AppException(ErrorCode.BAD_REQUEST, "클라우드 파일 크기가 올바르지 않습니다.")
                        }
                        output.write(buffer, 0, read)
                    }
                }
            }
            if (total != expectedLength) {
                throw AppException(ErrorCode.BAD_REQUEST, "클라우드 파일 크기가 올바르지 않습니다.")
            }
            return tempFile
        } catch (ex: Exception) {
            deleteTempFileQuietly(tempFile)
            throw ex
        }
    }

    private fun validateFileSize(
        byteSize: Long,
        detected: DetectedContent,
    ) {
        val limit = resolveUploadLimit(detected)
        if (byteSize <= limit.maxBytes) return

        throw AppException(
            ErrorCode.PAYLOAD_TOO_LARGE,
            "클라우드 ${limit.label} 파일은 ${formatFileSizeLimit(limit.maxBytes)} 이하여야 합니다.",
        )
    }

    private fun resolveUploadLimit(detected: DetectedContent): UploadLimit {
        val typeLimit =
            when {
                detected.contentType == ZIP_CONTENT_TYPE ->
                    UploadLimit("ZIP", cloudStorageProperties.cloudArchiveMaxFileSizeBytes)
                detected.contentType in ARCHIVE_CONTENT_TYPES ->
                    UploadLimit("아카이브", cloudStorageProperties.cloudArchiveMaxFileSizeBytes)
                detected.mediaKind == CloudFileMediaKind.PHOTO ->
                    UploadLimit("사진", cloudStorageProperties.cloudPhotoMaxFileSizeBytes)
                detected.mediaKind == CloudFileMediaKind.VIDEO ->
                    UploadLimit("동영상", cloudStorageProperties.cloudVideoMaxFileSizeBytes)
                else ->
                    UploadLimit("문서", cloudStorageProperties.cloudDocumentMaxFileSizeBytes)
            }

        val effectiveMaxBytes = minOf(typeLimit.maxBytes, cloudStorageProperties.maxFileSizeBytes)
        return typeLimit.copy(maxBytes = effectiveMaxBytes)
    }

    private fun detectContent(
        file: Path,
        declaredContentType: String?,
        filename: String,
    ): DetectedContent {
        val normalizedDeclared = resolveDeclaredContentType(declaredContentType)
        val header = ByteArray(SIGNATURE_HEADER_BYTES)
        val headerLen = readHeader(file, header)
        val detected =
            detectFromSignature(file, header, headerLen, normalizedDeclared, filename)
                ?: throw AppException(ErrorCode.BAD_REQUEST, "지원하지 않는 클라우드 파일 형식입니다.")

        if (
            normalizedDeclared != null &&
            normalizedDeclared in KNOWN_CONTENT_TYPES &&
            !isDeclaredContentTypeCompatible(normalizedDeclared, detected.contentType)
        ) {
            throw AppException(ErrorCode.BAD_REQUEST, "파일 내용과 콘텐츠 타입이 일치하지 않습니다.")
        }

        return detected
    }

    private fun isDeclaredContentTypeCompatible(
        declaredContentType: String,
        detectedContentType: String,
    ): Boolean =
        declaredContentType == detectedContentType ||
            (detectedContentType == HWPX_CONTENT_TYPE && declaredContentType == ZIP_CONTENT_TYPE) ||
            (detectedContentType == "video/quicktime" && declaredContentType == "video/mp4") ||
            (detectedContentType == "video/mp4" && declaredContentType == "video/quicktime") ||
            (declaredContentType in AUDIO_CONTENT_TYPES && detectedContentType in AUDIO_CONTENT_TYPES) ||
            (declaredContentType in TEXT_CONTENT_TYPES && detectedContentType in TEXT_CONTENT_TYPES)

    private fun resolveDeclaredContentType(raw: String?): String? {
        val normalized = normalizeContentType(raw)
        if (normalized.isBlank()) return null
        return CONTENT_TYPE_ALIASES[normalized] ?: normalized
    }

    private fun detectFromSignature(
        file: Path,
        header: ByteArray,
        headerLen: Int,
        declaredContentType: String?,
        filename: String,
    ): DetectedContent? {
        if (
            headerLen >= 5 &&
            ImageUploadAdmissionValidator.readInt32BE(header, 0) == PDF_MAGIC_WORD &&
            header[4] == '-'.code.toByte()
        ) {
            return DetectedContent("application/pdf", CloudFileMediaKind.DOCUMENT)
        }
        ImageUploadAdmissionValidator
            .detectImageFormatFromHeader(header, headerLen, allowExtendedRaster = true)
            ?.let { return DetectedContent(it.contentType, CloudFileMediaKind.PHOTO) }

        val extension = extractLowerExtension(filename)
        if (extension == "svg" || declaredContentType == SVG_CONTENT_TYPE) {
            if (CloudArchiveAndDocumentInspector.validateSafeSvg(file)) {
                return DetectedContent(SVG_CONTENT_TYPE, CloudFileMediaKind.PHOTO)
            }
            return null
        }

        CloudArchiveAndDocumentInspector
            .detectAudioFromSignature(header, headerLen, declaredContentType, extension)
            ?.let { return DetectedContent(it, CloudFileMediaKind.DOCUMENT) }

        val videoPreferred =
            if (extension == "mov" || declaredContentType == "video/quicktime") {
                "video/quicktime"
            } else if (extension == "mkv" || declaredContentType == "video/x-matroska") {
                "video/x-matroska"
            } else {
                null
            }
        detectVideoFromSignature(header.copyOf(headerLen), videoPreferred)?.let { videoMime ->
            return DetectedContent(videoMime, CloudFileMediaKind.VIDEO)
        }

        if (CloudArchiveAndDocumentInspector.isZipSignature(header, headerLen)) {
            val resolvedZipMime = CloudArchiveAndDocumentInspector.inspectZipOrOffice(file, extension)
            if (resolvedZipMime != null) {
                return DetectedContent(resolvedZipMime, CloudFileMediaKind.DOCUMENT)
            }
            return null
        }
        if (extension == "tar" || declaredContentType == CloudArchiveAndDocumentInspector.TAR_CONTENT_TYPE) {
            if (CloudArchiveAndDocumentInspector.inspectTar(file)) {
                return DetectedContent(CloudArchiveAndDocumentInspector.TAR_CONTENT_TYPE, CloudFileMediaKind.DOCUMENT)
            }
            return null
        }
        if (
            (headerLen >= 2 && (header[0].toInt() and 0xFF) == 0x1F && (header[1].toInt() and 0xFF) == 0x8B) ||
            extension == "gz" ||
            extension == "tgz" ||
            declaredContentType == CloudArchiveAndDocumentInspector.GZIP_CONTENT_TYPE
        ) {
            if (CloudArchiveAndDocumentInspector.inspectGzip(file, extension)) {
                return DetectedContent(CloudArchiveAndDocumentInspector.GZIP_CONTENT_TYPE, CloudFileMediaKind.DOCUMENT)
            }
            return null
        }
        if (extension == "7z" || declaredContentType == CloudArchiveAndDocumentInspector.SEVEN_ZIP_CONTENT_TYPE) {
            if (CloudArchiveAndDocumentInspector.inspect7z(file, header, headerLen)) {
                return DetectedContent(CloudArchiveAndDocumentInspector.SEVEN_ZIP_CONTENT_TYPE, CloudFileMediaKind.DOCUMENT)
            }
            return null
        }

        CloudArchiveAndDocumentInspector
            .inspectUtf8TextFile(file, declaredContentType, extension)
            ?.let { return DetectedContent(it, CloudFileMediaKind.DOCUMENT) }

        return null
    }

    private fun readHeader(
        file: Path,
        buffer: ByteArray,
    ): Int =
        BufferedInputStream(Files.newInputStream(file), IO_BUFFER_BYTES).use { stream ->
            ImageUploadAdmissionValidator.readUpTo(stream, buffer, buffer.size)
        }

    internal fun <T> executeWriteTransaction(block: () -> T): T {
        val manager = transactionManager ?: return block()
        return TransactionTemplate(manager).execute { block() }
            ?: throw IllegalStateException("Write transaction returned null")
    }

    internal fun <T> executeReadOnlyTransaction(block: () -> T): T {
        val manager = transactionManager ?: return block()
        val template =
            TransactionTemplate(manager).apply {
                isReadOnly = true
                propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRED
            }
        return template.execute { block() }
            ?: throw IllegalStateException("Read-only transaction returned null")
    }

    private data class DetectedContent(
        val contentType: String,
        val mediaKind: CloudFileMediaKind,
    )

    private data class UploadLimit(
        val label: String,
        val maxBytes: Long,
    )

    companion object {
        private const val STREAM_COPY_BUFFER_SIZE = 65_536
        private const val IO_BUFFER_BYTES = 8_192
        private const val SIGNATURE_HEADER_BYTES = 64
        private const val PDF_MAGIC_WORD = 0x2550_4446
        private const val HWPX_CONTENT_TYPE = CloudArchiveAndDocumentInspector.HWPX_CONTENT_TYPE
        private const val ZIP_CONTENT_TYPE = CloudArchiveAndDocumentInspector.ZIP_CONTENT_TYPE
        private const val SVG_CONTENT_TYPE = CloudArchiveAndDocumentInspector.SVG_CONTENT_TYPE
        private val ARCHIVE_CONTENT_TYPES =
            setOf(
                ZIP_CONTENT_TYPE,
                CloudArchiveAndDocumentInspector.TAR_CONTENT_TYPE,
                CloudArchiveAndDocumentInspector.GZIP_CONTENT_TYPE,
                CloudArchiveAndDocumentInspector.SEVEN_ZIP_CONTENT_TYPE,
            )
        private val AUDIO_CONTENT_TYPES =
            setOf(
                "audio/mpeg",
                "audio/wav",
                "audio/ogg",
                "audio/opus",
                "audio/mp4",
                "audio/aac",
                "audio/flac",
            )
        private val TEXT_CONTENT_TYPES =
            CloudArchiveAndDocumentInspector.TEXT_EXTENSION_CONTENT_TYPES.values.toSet() + "text/xml"
        private val CONTENT_TYPE_ALIASES =
            mapOf(
                "image/jpg" to "image/jpeg",
                "image/pjpeg" to "image/jpeg",
                "image/x-png" to "image/png",
                "image/x-webp" to "image/webp",
                "image/x-ms-bmp" to "image/bmp",
                "image/vnd.microsoft.icon" to "image/x-icon",
                "image/ico" to "image/x-icon",
                "application/x-hwpx" to HWPX_CONTENT_TYPE,
                "application/vnd.hancom.hwpx" to HWPX_CONTENT_TYPE,
                "application/x-zip-compressed" to ZIP_CONTENT_TYPE,
                "application/x-gzip" to CloudArchiveAndDocumentInspector.GZIP_CONTENT_TYPE,
                "audio/x-wav" to "audio/wav",
                "audio/x-flac" to "audio/flac",
                "audio/x-m4a" to "audio/mp4",
                "application/mp4" to "video/mp4",
                "video/matroska" to "video/x-matroska",
                "application/x-yaml" to "application/yaml",
                "text/yaml" to "application/yaml",
                "text/javascript" to "application/javascript",
            )
        private val KNOWN_CONTENT_TYPES =
            setOf(
                "application/pdf",
                HWPX_CONTENT_TYPE,
                ZIP_CONTENT_TYPE,
                CloudArchiveAndDocumentInspector.DOCX_CONTENT_TYPE,
                CloudArchiveAndDocumentInspector.XLSX_CONTENT_TYPE,
                CloudArchiveAndDocumentInspector.PPTX_CONTENT_TYPE,
                CloudArchiveAndDocumentInspector.TAR_CONTENT_TYPE,
                CloudArchiveAndDocumentInspector.GZIP_CONTENT_TYPE,
                CloudArchiveAndDocumentInspector.SEVEN_ZIP_CONTENT_TYPE,
                "image/jpeg",
                "image/png",
                "image/gif",
                "image/webp",
                "image/bmp",
                "image/x-icon",
                "image/avif",
                SVG_CONTENT_TYPE,
                "video/mp4",
                "video/quicktime",
                "video/webm",
                "video/x-matroska",
            ) + AUDIO_CONTENT_TYPES + TEXT_CONTENT_TYPES
    }
}
