package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
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
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    @Transactional
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
                                contentType = detected.contentType,
                                originalFilename = safeFilename,
                            ),
                        )
                    }

                val saved =
                    cloudFileRepository.save(
                        CloudFile.create(
                            ownerMemberId = ownerMemberId,
                            objectKey = uploadResult.objectKey,
                            originalFilename = safeFilename,
                            contentType = detected.contentType,
                            byteSize = contentLength,
                            mediaKind = detected.mediaKind,
                            folderPath = normalizedFolderPath,
                            checksumSha256 = uploadResult.checksumSha256,
                        ),
                    )
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
    ): CloudFileDto =
        cloudFileRepository
            .findActiveByIdAndOwner(fileId, ownerMemberId)
            ?.toDto(clock)
            ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")

    @Transactional(readOnly = true)
    fun openContent(
        ownerMemberId: Long,
        fileId: Long,
    ): CloudFileContent {
        // owner check가 storage open보다 먼저 실행되어야 비소유자가 object 존재 여부를 추론할 수 없다.
        val file =
            cloudFileRepository.findActiveByIdAndOwner(fileId, ownerMemberId)
                ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")
        val storedObject =
            cloudStoragePort.open(file.objectKey)
                ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")

        return CloudFileContent(
            file = file.toDto(clock),
            storedObject = storedObject,
        )
    }

    @Transactional(readOnly = true)
    fun openContentRange(
        ownerMemberId: Long,
        fileId: Long,
        range: LongRange,
    ): CloudFileContent {
        val file =
            cloudFileRepository.findActiveByIdAndOwner(fileId, ownerMemberId)
                ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")
        val storedObject =
            cloudStoragePort.openRange(file.objectKey, range)
                ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")

        return CloudFileContent(
            file = file.toDto(clock),
            storedObject = storedObject,
        )
    }

    @Transactional
    fun delete(
        ownerMemberId: Long,
        fileId: Long,
    ) {
        val file =
            cloudFileRepository.findActiveByIdAndOwner(fileId, ownerMemberId)
                ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")

        val objectKey = file.objectKey
        file.markDeleted(clock.instant())
        cloudFileRepository.save(file)
        deleteObjectAfterCommit(objectKey)
        logger.info("cloud_file_delete_completed fileId={} actorId={}", fileId, ownerMemberId)
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
        val header = readHeader(file, 16)
        val detected =
            detectFromSignature(file, header, filename)
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
        bytes: ByteArray,
        filename: String,
    ): DetectedContent? {
        if (bytes.size >= 5 && bytes.copyOfRange(0, 5).toString(Charsets.US_ASCII) == "%PDF-") {
            return DetectedContent("application/pdf", CloudFileMediaKind.DOCUMENT)
        }
        if (
            bytes.size >= 3 &&
            bytes[0] == 0xFF.toByte() &&
            bytes[1] == 0xD8.toByte() &&
            bytes[2] == 0xFF.toByte()
        ) {
            return DetectedContent("image/jpeg", CloudFileMediaKind.PHOTO)
        }
        if (
            bytes.size >= 8 &&
            bytes[0] == 0x89.toByte() &&
            bytes[1] == 0x50.toByte() &&
            bytes[2] == 0x4E.toByte() &&
            bytes[3] == 0x47.toByte() &&
            bytes[4] == 0x0D.toByte() &&
            bytes[5] == 0x0A.toByte() &&
            bytes[6] == 0x1A.toByte() &&
            bytes[7] == 0x0A.toByte()
        ) {
            return DetectedContent("image/png", CloudFileMediaKind.PHOTO)
        }
        if (bytes.size >= 6) {
            val header = bytes.copyOfRange(0, 6).toString(Charsets.US_ASCII)
            if (header == "GIF87a" || header == "GIF89a") return DetectedContent("image/gif", CloudFileMediaKind.PHOTO)
        }
        if (bytes.size >= 12) {
            val riff = bytes.copyOfRange(0, 4).toString(Charsets.US_ASCII)
            val webp = bytes.copyOfRange(8, 12).toString(Charsets.US_ASCII)
            if (riff == "RIFF" && webp == "WEBP") return DetectedContent("image/webp", CloudFileMediaKind.PHOTO)
        }
        detectVideoFromSignature(bytes)?.let { return DetectedContent(it, CloudFileMediaKind.VIDEO) }
        val extension = extractLowerExtension(filename)
        if (extension == "hwpx" && isHwpxPackage(file)) {
            return DetectedContent(HWPX_CONTENT_TYPE, CloudFileMediaKind.DOCUMENT)
        }
        if (extension == "zip" && isValidZipArchive(file)) {
            return DetectedContent(ZIP_CONTENT_TYPE, CloudFileMediaKind.DOCUMENT)
        }

        return null
    }

    private fun readHeader(
        file: Path,
        maxBytes: Int,
    ): ByteArray = Files.newInputStream(file).use { it.readNBytes(maxBytes) }

    private fun isHwpxPackage(file: Path): Boolean {
        if (!isZipSignature(readHeader(file, 4))) return false

        val entries = readZipEntryNames(file)

        return HWPX_MANIFEST_ENTRY in entries && entries.any { it in HWPX_DOCUMENT_ENTRIES }
    }

    private fun isValidZipArchive(file: Path): Boolean =
        isZipSignature(readHeader(file, 4)) &&
            runCatching {
                ZipFile(file.toFile()).use { zip -> zip.entries().hasMoreElements() || Files.size(file) >= ZIP_EOCD_MIN_SIZE }
            }.getOrDefault(false)

    private fun isZipSignature(bytes: ByteArray): Boolean =
        bytes.size >= 4 &&
            bytes.copyOfRange(0, 4).toList() in ZIP_SIGNATURES

    private fun readZipEntryNames(file: Path): Set<String> =
        runCatching {
            ZipFile(file.toFile()).use { zip ->
                zip
                    .entries()
                    .asSequence()
                    .map { it.name.replace('\\', '/') }
                    .toSet()
            }
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
        private const val HWPX_CONTENT_TYPE = "application/haansofthwpx"
        private const val ZIP_CONTENT_TYPE = "application/zip"
        private const val HWPX_MANIFEST_ENTRY = "Contents/content.hpf"
        private const val ZIP_EOCD_MIN_SIZE = 22
        private val HWPX_DOCUMENT_ENTRIES =
            setOf(
                "Contents/header.xml",
                "Contents/section0.xml",
                "META-INF/container.xml",
            )
        private val ZIP_SIGNATURES =
            setOf(
                listOf(0x50.toByte(), 0x4B.toByte(), 0x03.toByte(), 0x04.toByte()),
                listOf(0x50.toByte(), 0x4B.toByte(), 0x05.toByte(), 0x06.toByte()),
                listOf(0x50.toByte(), 0x4B.toByte(), 0x07.toByte(), 0x08.toByte()),
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
