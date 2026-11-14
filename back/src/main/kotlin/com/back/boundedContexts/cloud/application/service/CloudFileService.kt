package com.back.boundedContexts.cloud.application.service

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
import java.util.zip.ZipFile

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
)

data class CloudFileContent(
    val file: CloudFileDto,
    val storedObject: CloudStoragePort.StoredObject,
)

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
                    if (detected.mediaKind == CloudFileMediaKind.PHOTO) {
                        imageAdmissionValidator.validate(tempFile, detected.contentType).contentType
                    } else {
                        detected.contentType
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
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
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
            detectFromSignature(file, header, headerLen, filename)
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
            (detectedContentType == HWPX_CONTENT_TYPE && declaredContentType == ZIP_CONTENT_TYPE)

    private fun resolveDeclaredContentType(raw: String?): String? {
        val normalized = normalizeContentType(raw)
        if (normalized.isBlank()) return null
        return CONTENT_TYPE_ALIASES[normalized] ?: normalized
    }

    private fun detectFromSignature(
        file: Path,
        header: ByteArray,
        headerLen: Int,
        filename: String,
    ): DetectedContent? {
        if (
            headerLen >= 5 &&
            ImageUploadAdmissionValidator.readInt32BE(header, 0) == PDF_MAGIC_WORD &&
            header[4] == '-'.code.toByte()
        ) {
            return DetectedContent("application/pdf", CloudFileMediaKind.DOCUMENT)
        }
        ImageUploadAdmissionValidator.detectImageFormatFromHeader(header, headerLen)?.let {
            return DetectedContent(it.contentType, CloudFileMediaKind.PHOTO)
        }
        if (headerLen >= 12 && ImageUploadAdmissionValidator.readInt32BE(header, 4) == MP4_FTYP_WORD) {
            return DetectedContent("video/mp4", CloudFileMediaKind.VIDEO)
        }
        if (headerLen >= 4 && ImageUploadAdmissionValidator.readInt32BE(header, 0) == EBML_MAGIC_WORD) {
            return DetectedContent("video/webm", CloudFileMediaKind.VIDEO)
        }
        val extension = extractLowerExtension(filename)
        if (extension == "hwpx" && isHwpxPackage(file, header, headerLen)) {
            return DetectedContent(HWPX_CONTENT_TYPE, CloudFileMediaKind.DOCUMENT)
        }
        if (extension == "zip" && isValidZipArchive(file, header, headerLen)) {
            return DetectedContent(ZIP_CONTENT_TYPE, CloudFileMediaKind.DOCUMENT)
        }

        return null
    }

    private fun readHeader(
        file: Path,
        buffer: ByteArray,
    ): Int =
        BufferedInputStream(Files.newInputStream(file), IO_BUFFER_BYTES).use { stream ->
            ImageUploadAdmissionValidator.readUpTo(stream, buffer, buffer.size)
        }

    private fun isHwpxPackage(
        file: Path,
        header: ByteArray,
        headerLen: Int,
    ): Boolean {
        if (!isZipSignature(header, headerLen)) return false

        val entries = readZipEntryNames(file)

        return HWPX_MANIFEST_ENTRY in entries && entries.any { it in HWPX_DOCUMENT_ENTRIES }
    }

    private fun isValidZipArchive(
        file: Path,
        header: ByteArray,
        headerLen: Int,
    ): Boolean =
        isZipSignature(header, headerLen) &&
            runCatching {
                ZipFile(file.toFile()).use { zip -> zip.entries().hasMoreElements() || Files.size(file) >= ZIP_EOCD_MIN_SIZE }
            }.getOrDefault(false)

    private fun isZipSignature(
        bytes: ByteArray,
        length: Int,
    ): Boolean {
        if (length < 4) return false
        val word = ImageUploadAdmissionValidator.readInt32BE(bytes, 0)
        return word == ZIP_LOCAL_HEADER_WORD || word == ZIP_EOCD_WORD || word == ZIP_SPANNED_WORD
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

    private fun readZipEntryNames(file: Path): Set<String> =
        runCatching {
            ZipFile(file.toFile()).use { zip ->
                val names = LinkedHashSet<String>()
                val entries = zip.entries()
                var count = 0
                while (entries.hasMoreElements()) {
                    count += 1
                    if (count > MAX_ZIP_ENTRIES) {
                        throw AppException(ErrorCode.BAD_REQUEST, "ZIP 아카이브 엔트리 수가 허용 상한을 초과했습니다.")
                    }
                    names.add(entries.nextElement().name.replace('\\', '/'))
                }
                names
            }
        }.onFailure { ex ->
            if (ex is AppException) throw ex
        }.getOrDefault(emptySet())

    private data class DetectedContent(
        val contentType: String,
        val mediaKind: CloudFileMediaKind,
    )

    private data class UploadLimit(
        val label: String,
        val maxBytes: Long,
    )

    companion object {
        private const val IO_BUFFER_BYTES = 8_192
        private const val SIGNATURE_HEADER_BYTES = 64
        private const val PDF_MAGIC_WORD = 0x2550_4446
        private const val MP4_FTYP_WORD = 0x6674_7970
        private const val EBML_MAGIC_WORD = 0x1A45_DFA3
        private const val ZIP_LOCAL_HEADER_WORD = 0x504B_0304
        private const val ZIP_EOCD_WORD = 0x504B_0506
        private const val ZIP_SPANNED_WORD = 0x504B_0708
        private const val HWPX_CONTENT_TYPE = "application/haansofthwpx"
        private const val ZIP_CONTENT_TYPE = "application/zip"
        private const val HWPX_MANIFEST_ENTRY = "Contents/content.hpf"
        private const val ZIP_EOCD_MIN_SIZE = 22
        private const val MAX_ZIP_ENTRIES = 10_000
        private val HWPX_DOCUMENT_ENTRIES =
            setOf(
                "Contents/header.xml",
                "Contents/section0.xml",
                "META-INF/container.xml",
            )
        private val CONTENT_TYPE_ALIASES =
            mapOf(
                "image/jpg" to "image/jpeg",
                "image/pjpeg" to "image/jpeg",
                "image/x-png" to "image/png",
                "image/x-webp" to "image/webp",
                "application/x-hwpx" to HWPX_CONTENT_TYPE,
                "application/x-zip-compressed" to ZIP_CONTENT_TYPE,
            )
        private val KNOWN_CONTENT_TYPES =
            setOf(
                "application/pdf",
                HWPX_CONTENT_TYPE,
                ZIP_CONTENT_TYPE,
                "image/jpeg",
                "image/png",
                "image/gif",
                "image/webp",
                "video/mp4",
                "video/webm",
            )
    }
}
