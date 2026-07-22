package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.application.port.output.CloudVideoUploadPartRepositoryPort
import com.back.boundedContexts.cloud.application.port.output.CloudVideoUploadSessionRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.boundedContexts.cloud.model.CloudVideoUploadPart
import com.back.boundedContexts.cloud.model.CloudVideoUploadSession
import com.back.boundedContexts.cloud.model.CloudVideoUploadSessionStatus
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.application.CloudMultipartCommitDetector
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import com.back.global.storage.metrics.CloudMediaMetrics
import com.fasterxml.jackson.annotation.JsonInclude
import io.micrometer.core.instrument.MeterRegistry
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import java.io.InputStream
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.security.DigestInputStream
import java.security.MessageDigest
import java.text.Normalizer
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

private val CLOUD_VIDEO_UPLOAD_DATE_PATH_FORMATTER = DateTimeFormatter.ofPattern("yyyy/MM/dd")
private const val CLOUD_VIDEO_UPLOAD_MAX_FILENAME_CODE_POINTS = 255L
private const val CLOUD_VIDEO_UPLOAD_MAX_FILENAME_METADATA_ENCODED_BYTES = 1024
private const val CLOUD_VIDEO_UPLOAD_MAX_MULTIPART_PARTS = 10_000L
private const val INVALID_PART_SIZE_MESSAGE = "업로드 조각 크기가 올바르지 않습니다."
private const val PART_CONTENT_CONFLICT_MESSAGE = "이미 다른 내용의 업로드 조각이 저장되어 있습니다."
private const val MULTIPART_COMPOSITE_CHECKSUM_PREFIX = "sha256-composite:"
private const val INTEGRITY_MISMATCH_MESSAGE = "완성된 업로드 파일의 무결성 검증에 실패했습니다."
private const val COMMITTED_OBJECT_NOT_VISIBLE_MESSAGE =
    "완성된 업로드 객체를 아직 확인할 수 없습니다. 잠시 후 다시 시도해주세요."

data class CloudVideoUploadSessionDto(
    val id: Long,
    val ownerMemberId: Long,
    val originalFilename: String,
    val contentType: String,
    val byteSize: Long,
    val folderPath: String,
    val partSizeBytes: Long,
    val totalParts: Int,
    val uploadedParts: List<Int>,
    val status: CloudVideoUploadSessionStatus,
    val expiresAt: Instant,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val completedFileId: Long?,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val failureReason: String?,
)

data class CloudVideoUploadPartDto(
    val partNumber: Int,
    val byteSize: Long,
)

data class CloudVideoUploadPartResultDto(
    val session: CloudVideoUploadSessionDto,
    val part: CloudVideoUploadPartDto,
)

@Service
class CloudVideoUploadSessionService(
    private val sessionRepository: CloudVideoUploadSessionRepositoryPort,
    private val partRepository: CloudVideoUploadPartRepositoryPort,
    private val cloudFileRepository: CloudFileRepositoryPort,
    private val cloudStoragePort: CloudStoragePort,
    private val cloudStorageProperties: CloudStorageProperties = CloudStorageProperties(),
    private val clock: Clock = Clock.systemUTC(),
    private val meterRegistry: MeterRegistry? = null,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    init {
        cloudStorageProperties.validateResumableLifetimeAgainstMinioStaleExpiry()
    }

    fun createSession(
        ownerMemberId: Long,
        originalFilename: String?,
        contentType: String?,
        byteSize: Long,
        folderPath: String?,
    ): CloudVideoUploadSessionDto {
        val safeFilename = normalizeFilename(originalFilename)
        val normalizedFolderPath = normalizeFolderPath(folderPath)
        val normalizedContentType = normalizeVideoContentType(contentType, safeFilename)
        validateTotalSize(byteSize)
        val partSizeBytes = resolvePartSizeBytes()
        val totalParts = resolveTotalParts(byteSize, partSizeBytes)
        val objectKey =
            buildObjectKey(
                ownerMemberId = ownerMemberId,
                folderPath = normalizedFolderPath,
                originalFilename = safeFilename,
            )
        val expiresAt = clock.instant().plusSeconds(cloudStorageProperties.cloudVideoResumableExpiresSeconds.coerceAtLeast(60))
        val session =
            sessionRepository.save(
                CloudVideoUploadSession(
                    ownerMemberId = ownerMemberId,
                    objectKey = objectKey,
                    uploadId = null,
                    originalFilename = safeFilename,
                    contentType = normalizedContentType,
                    byteSize = byteSize,
                    folderPath = normalizedFolderPath,
                    partSizeBytes = partSizeBytes,
                    totalParts = totalParts,
                    expiresAt = expiresAt,
                    status = CloudVideoUploadSessionStatus.INITIATING,
                ),
            )
        val upload =
            try {
                cloudStoragePort.initiateMultipartUpload(
                    CloudStoragePort.MultipartUploadInitRequest(
                        objectKey = objectKey,
                        contentType = normalizedContentType,
                        originalFilename = safeFilename,
                    ),
                )
            } catch (ex: RuntimeException) {
                markFailed(session.id, CloudVideoUploadSessionStatus.INITIATING, "multipart initiate failed: ${ex.message}")
                throw ex
            }

        val now = clock.instant()
        val initiated =
            sessionRepository.attachUploadIdAndTransition(
                id = session.id,
                expectedStatus = CloudVideoUploadSessionStatus.INITIATING,
                uploadId = upload.uploadId,
                nextStatus = CloudVideoUploadSessionStatus.IN_PROGRESS,
                now = now,
            ) == 1
        if (!initiated) {
            markFailed(session.id, CloudVideoUploadSessionStatus.INITIATING, "multipart initiate metadata attach failed")
            abortQuietly(upload.objectKey, upload.uploadId)
            throw AppException(ErrorCode.CLOUD_UPLOAD_CONFLICT, "대용량 업로드 세션 상태가 변경되었습니다.")
        }
        session.markInitiated(upload.uploadId, now)
        CloudMediaMetrics.recordSessionTransition(
            meterRegistry,
            from = CloudVideoUploadSessionStatus.INITIATING.name,
            to = CloudVideoUploadSessionStatus.IN_PROGRESS.name,
        )
        log.info(
            "cloud_video_session_create_completed sessionId={} actorId={}",
            session.id,
            ownerMemberId,
        )

        return session.toDto(emptyList())
    }

    fun getSession(
        ownerMemberId: Long,
        sessionId: Long,
    ): CloudVideoUploadSessionDto {
        val session = findOwnedSession(ownerMemberId, sessionId)
        if (expireSessionIfNeeded(session)) {
            throw AppException(ErrorCode.GONE, "대용량 업로드 세션이 만료되었습니다.")
        }
        val parts = partRepository.findBySessionId(session.id)
        return session.toDto(parts)
    }

    fun purgeExpiredSessions(batchSize: Int): Int {
        val sessions = sessionRepository.findExpiredInProgress(clock.instant(), batchSize.coerceAtLeast(1))
        var purgedCount = 0
        sessions.forEach { session ->
            runCatching {
                if (expireSession(session)) {
                    purgedCount++
                }
            }.onFailure {
                log.warn(
                    "Expired cloud video multipart upload cleanup failed (sessionId={}, objectKey={})",
                    session.id,
                    session.objectKey,
                    it,
                )
            }
        }
        return purgedCount
    }

    fun purgeStaleIntermediateSessions(batchSize: Int): Int {
        val now = clock.instant()
        val sessions =
            sessionRepository.findStaleIntermediate(
                initiatingCutoff =
                    now.minusSeconds(
                        cloudStorageProperties.cloudVideoResumableStaleInitiatingGraceSeconds.coerceAtLeast(1),
                    ),
                completingOrAbortingCutoff =
                    now.minusSeconds(
                        cloudStorageProperties.cloudVideoResumableStaleCompletingGraceSeconds.coerceAtLeast(1),
                    ),
                uploadingPartCutoff =
                    now.minusSeconds(
                        cloudStorageProperties.cloudVideoResumableStaleUploadingPartGraceSeconds.coerceAtLeast(1),
                    ),
                limit = batchSize.coerceAtLeast(1),
            )
        var recoveredCount = 0
        sessions.forEach { session ->
            runCatching {
                if (recoverStaleIntermediateSession(session)) {
                    recoveredCount++
                }
            }.onFailure {
                log.warn(
                    "Stale cloud video multipart upload recovery failed (sessionId={}, objectKey={}, status={})",
                    session.id,
                    session.objectKey,
                    session.status,
                    it,
                )
            }
        }
        return recoveredCount
    }

    fun countStaleIntermediateSessions(): Long {
        val now = clock.instant()
        return sessionRepository.countStaleIntermediate(
            initiatingCutoff =
                now.minusSeconds(
                    cloudStorageProperties.cloudVideoResumableStaleInitiatingGraceSeconds.coerceAtLeast(1),
                ),
            completingOrAbortingCutoff =
                now.minusSeconds(
                    cloudStorageProperties.cloudVideoResumableStaleCompletingGraceSeconds.coerceAtLeast(1),
                ),
            uploadingPartCutoff =
                now.minusSeconds(
                    cloudStorageProperties.cloudVideoResumableStaleUploadingPartGraceSeconds.coerceAtLeast(1),
                ),
        )
    }

    fun uploadPart(
        ownerMemberId: Long,
        sessionId: Long,
        partNumber: Int,
        inputStream: InputStream,
        contentLength: Long,
    ): CloudVideoUploadPartResultDto {
        val startedAt = System.nanoTime()
        return try {
            inputStream.use { source ->
                val session = findMutableSession(ownerMemberId, sessionId)
                validatePartNumber(session, partNumber)
                validatePartSize(session, partNumber, contentLength)
                val bufferedPart = copyPartToTempFile(source, contentLength)
                val tempFile = bufferedPart.path
                try {
                    validateFirstPartSignature(session, partNumber, tempFile)
                    resolveIdempotentPart(session, partNumber, contentLength, bufferedPart, startedAt)?.let { return it }
                    return uploadNewPart(session, partNumber, contentLength, bufferedPart, tempFile, startedAt)
                } finally {
                    deleteTempFileQuietly(tempFile)
                }
            }
        } catch (ex: RuntimeException) {
            CloudMediaMetrics.recordPartUpload(
                meterRegistry,
                result = "failure",
                durationNanos = System.nanoTime() - startedAt,
                bytes = contentLength,
            )
            throw ex
        }
    }

    private fun resolveIdempotentPart(
        session: CloudVideoUploadSession,
        partNumber: Int,
        contentLength: Long,
        bufferedPart: BufferedUploadPart,
        startedAt: Long,
    ): CloudVideoUploadPartResultDto? {
        val existing = partRepository.findBySessionIdAndPartNumber(session.id, partNumber) ?: return null
        if (existing.byteSize != contentLength) {
            throw AppException(ErrorCode.CLOUD_UPLOAD_CONFLICT, "이미 다른 크기의 업로드 조각이 저장되어 있습니다.")
        }
        val existingSha = existing.partSha256
        if (existingSha.isBlank()) {
            // Legacy blank part_sha256 cannot prove S3 bytes match — replace via re-upload.
            partRepository.delete(existing)
            return null
        }
        if (!existingSha.equals(bufferedPart.sha256Hex, ignoreCase = true)) {
            throw AppException(ErrorCode.CLOUD_UPLOAD_CONFLICT, PART_CONTENT_CONFLICT_MESSAGE)
        }
        extendSessionExpiry(session)
        CloudMediaMetrics.recordPartUpload(
            meterRegistry,
            result = "idempotent",
            durationNanos = System.nanoTime() - startedAt,
            bytes = contentLength,
        )
        return CloudVideoUploadPartResultDto(
            session = session.toDto(partRepository.findBySessionId(session.id)),
            part = existing.toDto(),
        )
    }

    private fun uploadNewPart(
        session: CloudVideoUploadSession,
        partNumber: Int,
        contentLength: Long,
        bufferedPart: BufferedUploadPart,
        tempFile: Path,
        startedAt: Long,
    ): CloudVideoUploadPartResultDto {
        claimStatus(
            session,
            expectedStatus = CloudVideoUploadSessionStatus.IN_PROGRESS,
            nextStatus = CloudVideoUploadSessionStatus.UPLOADING_PART,
            conflictMessage = "다른 업로드 작업이 진행 중입니다.",
        )
        val uploadResult =
            try {
                Files.newInputStream(tempFile).use { partStream ->
                    cloudStoragePort.uploadMultipartPart(
                        CloudStoragePort.MultipartUploadPartRequest(
                            objectKey = session.objectKey,
                            uploadId = requireUploadId(session),
                            partNumber = partNumber,
                            inputStream = partStream,
                            contentLength = contentLength,
                        ),
                    )
                }
            } catch (ex: RuntimeException) {
                releasePartUploadClaim(session.id)
                throw ex
            }
        val savedPart =
            try {
                partRepository.save(
                    CloudVideoUploadPart(
                        sessionId = session.id,
                        partNumber = partNumber,
                        eTag = uploadResult.eTag,
                        byteSize = contentLength,
                        partSha256 = bufferedPart.sha256Hex,
                    ),
                )
            } catch (ex: RuntimeException) {
                markFailed(
                    session.id,
                    CloudVideoUploadSessionStatus.UPLOADING_PART,
                    "multipart part metadata save failed: ${ex.message}",
                )
                throw ex
            }
        transitionStatus(
            session.id,
            expectedStatus = CloudVideoUploadSessionStatus.UPLOADING_PART,
            nextStatus = CloudVideoUploadSessionStatus.IN_PROGRESS,
        )
        session.transitionTo(CloudVideoUploadSessionStatus.IN_PROGRESS, clock.instant())
        extendSessionExpiry(session)
        CloudMediaMetrics.recordPartUpload(
            meterRegistry,
            result = "success",
            durationNanos = System.nanoTime() - startedAt,
            bytes = contentLength,
        )
        return CloudVideoUploadPartResultDto(
            session = session.toDto(partRepository.findBySessionId(session.id)),
            part = savedPart.toDto(),
        )
    }

    fun complete(
        ownerMemberId: Long,
        sessionId: Long,
    ): CloudFileDto {
        val session = findOwnedSession(ownerMemberId, sessionId)
        if (session.status == CloudVideoUploadSessionStatus.COMPLETED) {
            return completedFileDto(session)
        }
        when (session.status) {
            CloudVideoUploadSessionStatus.IN_PROGRESS -> {
                if (expireSessionIfNeeded(session)) {
                    throw AppException(ErrorCode.GONE, "대용량 업로드 세션이 만료되었습니다.")
                }
                val parts = requireCompleteParts(session)
                claimStatus(
                    session,
                    expectedStatus = CloudVideoUploadSessionStatus.IN_PROGRESS,
                    nextStatus = CloudVideoUploadSessionStatus.COMPLETING,
                    conflictMessage = "다른 업로드 작업이 진행 중입니다.",
                )
                ensureStorageCommitted(session, parts)
                return finishCommittedSession(session).toDto()
            }
            CloudVideoUploadSessionStatus.COMPLETING -> {
                val parts = requireCompleteParts(session)
                ensureStorageCommitted(session, parts)
                return finishCommittedSession(session).toDto()
            }
            else -> throw AppException(ErrorCode.CLOUD_UPLOAD_CONFLICT, "이미 종료된 대용량 업로드 세션입니다.")
        }
    }

    fun cancel(
        ownerMemberId: Long,
        sessionId: Long,
    ) {
        val session = findOwnedSession(ownerMemberId, sessionId)
        if (isTerminalStatus(session.status)) return
        if (session.status != CloudVideoUploadSessionStatus.IN_PROGRESS) {
            throw AppException(ErrorCode.CLOUD_UPLOAD_CONFLICT, "다른 업로드 작업이 진행 중입니다.")
        }

        claimStatus(
            session,
            expectedStatus = CloudVideoUploadSessionStatus.IN_PROGRESS,
            nextStatus = CloudVideoUploadSessionStatus.ABORTING,
            conflictMessage = "다른 업로드 작업이 진행 중입니다.",
        )
        abortOrFail(session, finalStatusOnFailure = CloudVideoUploadSessionStatus.ABORTING)
        partRepository.deleteBySessionId(session.id)
        session.cancel(clock.instant())
        sessionRepository.save(session)
        CloudMediaMetrics.recordSessionTransition(
            meterRegistry,
            from = CloudVideoUploadSessionStatus.ABORTING.name,
            to = CloudVideoUploadSessionStatus.CANCELLED.name,
        )
    }

    private fun findOwnedSession(
        ownerMemberId: Long,
        sessionId: Long,
    ): CloudVideoUploadSession =
        sessionRepository.findByIdAndOwner(sessionId, ownerMemberId)
            ?: throw AppException(ErrorCode.NOT_FOUND, "대용량 업로드 세션을 찾을 수 없습니다.")

    private fun findMutableSession(
        ownerMemberId: Long,
        sessionId: Long,
    ): CloudVideoUploadSession {
        val session = findOwnedSession(ownerMemberId, sessionId)
        if (session.status != CloudVideoUploadSessionStatus.IN_PROGRESS) {
            throw AppException(ErrorCode.CLOUD_UPLOAD_CONFLICT, "이미 종료된 대용량 업로드 세션입니다.")
        }
        if (expireSessionIfNeeded(session)) {
            throw AppException(ErrorCode.GONE, "대용량 업로드 세션이 만료되었습니다.")
        }

        return session
    }

    private fun expireSessionIfNeeded(session: CloudVideoUploadSession): Boolean {
        if (session.status != CloudVideoUploadSessionStatus.IN_PROGRESS) return false
        if (session.expiresAt > clock.instant()) return false
        return expireSession(session)
    }

    private fun expireSession(session: CloudVideoUploadSession): Boolean {
        val claimed =
            transitionStatus(
                session.id,
                expectedStatus = CloudVideoUploadSessionStatus.IN_PROGRESS,
                nextStatus = CloudVideoUploadSessionStatus.ABORTING,
                throwOnFailure = false,
            )
        if (!claimed) return false
        session.transitionTo(CloudVideoUploadSessionStatus.ABORTING, clock.instant())
        abortOrFail(session, finalStatusOnFailure = CloudVideoUploadSessionStatus.ABORTING)
        partRepository.deleteBySessionId(session.id)
        session.expire(clock.instant())
        sessionRepository.save(session)
        CloudMediaMetrics.recordSessionTransition(
            meterRegistry,
            from = CloudVideoUploadSessionStatus.ABORTING.name,
            to = CloudVideoUploadSessionStatus.EXPIRED.name,
        )
        log.info(
            "cloud_video_session_expire_completed sessionId={} actorId={}",
            session.id,
            session.ownerMemberId,
        )
        return true
    }

    private fun recoverStaleIntermediateSession(session: CloudVideoUploadSession): Boolean =
        when (session.status) {
            CloudVideoUploadSessionStatus.INITIATING -> {
                if (session.uploadId == null) {
                    markFailed(
                        session.id,
                        CloudVideoUploadSessionStatus.INITIATING,
                        "stale INITIATING session recovered without uploadId",
                    ) == 1
                } else {
                    abortStaleIntermediateSession(session, CloudVideoUploadSessionStatus.INITIATING)
                }
            }
            CloudVideoUploadSessionStatus.UPLOADING_PART ->
                abortStaleIntermediateSession(session, CloudVideoUploadSessionStatus.UPLOADING_PART)
            CloudVideoUploadSessionStatus.ABORTING ->
                abortStaleIntermediateSession(session, CloudVideoUploadSessionStatus.ABORTING)
            CloudVideoUploadSessionStatus.COMPLETING -> recoverStaleCompletingSession(session)
            else -> false
        }

    private fun recoverStaleCompletingSession(session: CloudVideoUploadSession): Boolean {
        val head = cloudStoragePort.head(session.objectKey)
        // Transient HeadObject miss: leave COMPLETING for client/stale retry (do not abort/delete).
        if (head == null) {
            return false
        }
        if (CloudMultipartCommitDetector.isCommitted(head, session.byteSize)) {
            if (session.status != CloudVideoUploadSessionStatus.COMPLETING) return false
            finishCommittedSession(session)
            return true
        }
        return abortStaleIntermediateSession(session, CloudVideoUploadSessionStatus.COMPLETING)
    }

    private fun requireCompleteParts(session: CloudVideoUploadSession): List<CloudVideoUploadPart> {
        val parts = partRepository.findBySessionId(session.id).sortedBy { it.partNumber }
        if (parts.size != session.totalParts || parts.map { it.partNumber } != (1..session.totalParts).toList()) {
            throw AppException(ErrorCode.CLOUD_UPLOAD_CONFLICT, "아직 업로드되지 않은 동영상 조각이 있습니다.")
        }
        return parts
    }

    private fun ensureStorageCommitted(
        session: CloudVideoUploadSession,
        parts: List<CloudVideoUploadPart>,
    ) {
        val existingHead = cloudStoragePort.head(session.objectKey)
        if (CloudMultipartCommitDetector.isCommitted(existingHead, session.byteSize)) {
            return
        }
        try {
            cloudStoragePort.completeMultipartUpload(
                CloudStoragePort.MultipartUploadCompleteRequest(
                    objectKey = session.objectKey,
                    uploadId = requireUploadId(session),
                    parts =
                        parts.map {
                            CloudStoragePort.CompletedMultipartUploadPart(
                                partNumber = it.partNumber,
                                eTag = it.eTag,
                            )
                        },
                ),
            )
        } catch (ex: RuntimeException) {
            val committedHead = cloudStoragePort.head(session.objectKey)
            if (CloudMultipartCommitDetector.isCommitted(committedHead, session.byteSize)) {
                return
            }
            markFailed(session.id, CloudVideoUploadSessionStatus.COMPLETING, "multipart complete failed: ${ex.message}")
            throw ex
        }
    }

    private fun finishCommittedSession(session: CloudVideoUploadSession): CloudFile {
        val parts = partRepository.findBySessionId(session.id).sortedBy { it.partNumber }
        val checksumSha256 = verifyCommittedObjectIntegrity(session, parts)
        val file = resolveOrCreateCommittedFile(session, checksumSha256)
        // Boolean.and is non-short-circuiting so both sides stay coverage-visible.
        val alreadyCompletedWithSameFile =
            (session.status == CloudVideoUploadSessionStatus.COMPLETED) and
                (session.completedFileId == file.id)
        if (!alreadyCompletedWithSameFile) {
            val fromStatus = session.status
            session.complete(file.id, clock.instant())
            sessionRepository.save(session)
            CloudMediaMetrics.recordSessionTransition(
                meterRegistry,
                from = fromStatus.name,
                to = CloudVideoUploadSessionStatus.COMPLETED.name,
            )
            log.info(
                "cloud_video_session_complete_completed sessionId={} fileId={} actorId={}",
                session.id,
                file.id,
                session.ownerMemberId,
            )
        }
        return file
    }

    private fun resolveOrCreateCommittedFile(
        session: CloudVideoUploadSession,
        checksumSha256: String?,
    ): CloudFile {
        cloudFileRepository.findActiveByObjectKey(session.objectKey)?.let { return it }
        cloudFileRepository.findByObjectKey(session.objectKey)?.let { softDeleted ->
            return reactivateSoftDeletedFile(softDeleted, session, checksumSha256)
        }
        return runCatching {
            cloudFileRepository.save(
                CloudFile.create(
                    ownerMemberId = session.ownerMemberId,
                    objectKey = session.objectKey,
                    originalFilename = session.originalFilename,
                    contentType = session.contentType,
                    byteSize = session.byteSize,
                    mediaKind = CloudFileMediaKind.VIDEO,
                    folderPath = session.folderPath,
                    checksumSha256 = checksumSha256,
                ),
            )
        }.getOrElse { exception ->
            if (exception !is DataIntegrityViolationException) {
                throw exception
            }
            cloudFileRepository.findActiveByObjectKey(session.objectKey)?.let { return it }
            val softDeleted =
                cloudFileRepository.findByObjectKey(session.objectKey)
                    ?: throw exception
            return reactivateSoftDeletedFile(softDeleted, session, checksumSha256)
        }
    }

    private fun reactivateSoftDeletedFile(
        softDeleted: CloudFile,
        session: CloudVideoUploadSession,
        checksumSha256: String?,
    ): CloudFile {
        softDeleted.restoreForCommittedUpload(
            originalFilename = session.originalFilename,
            contentType = session.contentType,
            byteSize = session.byteSize,
            mediaKind = CloudFileMediaKind.VIDEO,
            folderPath = session.folderPath,
            checksumSha256 = checksumSha256,
        )
        return cloudFileRepository.save(softDeleted)
    }

    private fun verifyCommittedObjectIntegrity(
        session: CloudVideoUploadSession,
        parts: List<CloudVideoUploadPart>,
    ): String? {
        val head = cloudStoragePort.head(session.objectKey)
        // Null/not-yet-visible head after complete: keep COMPLETING and ask client to retry.
        // CloudMultipartCommitDetector.isCommitted(null, ...) is false, but must not delete.
        if (head == null) {
            throw AppException(ErrorCode.CLOUD_UPLOAD_CONFLICT, COMMITTED_OBJECT_NOT_VISIBLE_MESSAGE)
        }
        if (!CloudMultipartCommitDetector.isCommitted(head, session.byteSize)) {
            failIntegrityAndCleanup(
                session,
                "multipart integrity size mismatch: head=${head.contentLength}, expected=${session.byteSize}",
            )
            throw AppException(ErrorCode.CLOUD_UPLOAD_CONFLICT, INTEGRITY_MISMATCH_MESSAGE)
        }
        if (parts.size != session.totalParts || parts.any { it.partSha256.isBlank() }) {
            log.warn(
                "Cloud video multipart composite checksum skipped (sessionId={}, parts={}, totalParts={})",
                session.id,
                parts.size,
                session.totalParts,
            )
            return null
        }
        return computeCompositeChecksum(parts)
    }

    private fun failIntegrityAndCleanup(
        session: CloudVideoUploadSession,
        reason: String,
    ) {
        runCatching { cloudStoragePort.delete(session.objectKey) }
            .onFailure {
                log.warn(
                    "Cloud video multipart integrity cleanup delete failed (sessionId={}, objectKey={})",
                    session.id,
                    session.objectKey,
                    it,
                )
            }
        partRepository.deleteBySessionId(session.id)
        markFailed(session.id, CloudVideoUploadSessionStatus.COMPLETING, reason)
    }

    private fun computeCompositeChecksum(parts: List<CloudVideoUploadPart>): String {
        val digest = MessageDigest.getInstance("SHA-256")
        parts.sortedBy { it.partNumber }.forEach { part ->
            digest.update(part.partSha256.hexToByteArray())
        }
        return "$MULTIPART_COMPOSITE_CHECKSUM_PREFIX${digest.digest().toHex()}-${parts.size}"
    }

    private fun extendSessionExpiry(session: CloudVideoUploadSession) {
        val now = clock.instant()
        val slidingSeconds = cloudStorageProperties.cloudVideoResumableExpiresSeconds.coerceAtLeast(60)
        val absoluteMaxSeconds =
            cloudStorageProperties.cloudVideoResumableAbsoluteMaxSeconds.coerceAtLeast(slidingSeconds)
        val absoluteDeadline = session.createdAt.plusSeconds(absoluteMaxSeconds)
        val candidate = now.plusSeconds(slidingSeconds)
        val newExpiresAt = if (candidate.isAfter(absoluteDeadline)) absoluteDeadline else candidate
        if (!newExpiresAt.isAfter(session.expiresAt)) {
            return
        }
        val extended =
            sessionRepository.extendExpiresAt(
                id = session.id,
                newExpiresAt = newExpiresAt,
                now = now,
            ) == 1
        if (extended) {
            session.expiresAt = newExpiresAt
        }
    }

    private fun completedFileDto(session: CloudVideoUploadSession): CloudFileDto {
        val fileId = session.completedFileId
        val active =
            fileId?.let { cloudFileRepository.findActiveByIdAndOwner(it, session.ownerMemberId) }
                ?: cloudFileRepository.findActiveByObjectKey(session.objectKey)
        if (active != null) {
            return active.toDto()
        }
        val softDeleted =
            cloudFileRepository.findByObjectKey(session.objectKey)?.takeIf { file ->
                file.ownerMemberId == session.ownerMemberId &&
                    (fileId == null || file.id == fileId)
            } ?: throw AppException(ErrorCode.INTERNAL_ERROR, "완료된 업로드 파일을 찾을 수 없습니다.")
        return reactivateSoftDeletedFile(
            softDeleted,
            session,
            checksumSha256 = softDeleted.checksumSha256,
        ).toDto()
    }

    private fun abortStaleIntermediateSession(
        session: CloudVideoUploadSession,
        expectedStatus: CloudVideoUploadSessionStatus,
    ): Boolean {
        val claimed =
            transitionStatus(
                session.id,
                expectedStatus = expectedStatus,
                nextStatus = CloudVideoUploadSessionStatus.ABORTING,
                throwOnFailure = false,
            )
        if (!claimed) return false
        session.transitionTo(CloudVideoUploadSessionStatus.ABORTING, clock.instant())
        abortOrFail(session, finalStatusOnFailure = CloudVideoUploadSessionStatus.ABORTING)
        partRepository.deleteBySessionId(session.id)
        session.fail("stale intermediate multipart session recovered", clock.instant())
        sessionRepository.save(session)
        CloudMediaMetrics.recordSessionTransition(
            meterRegistry,
            from = CloudVideoUploadSessionStatus.ABORTING.name,
            to = CloudVideoUploadSessionStatus.FAILED.name,
        )
        return true
    }

    private fun claimStatus(
        session: CloudVideoUploadSession,
        expectedStatus: CloudVideoUploadSessionStatus,
        nextStatus: CloudVideoUploadSessionStatus,
        conflictMessage: String,
    ) {
        val claimed =
            transitionStatus(
                session.id,
                expectedStatus = expectedStatus,
                nextStatus = nextStatus,
                throwOnFailure = false,
            )
        if (!claimed) {
            throw AppException(ErrorCode.CLOUD_UPLOAD_CONFLICT, conflictMessage)
        }
        session.transitionTo(nextStatus, clock.instant())
    }

    private fun transitionStatus(
        sessionId: Long,
        expectedStatus: CloudVideoUploadSessionStatus,
        nextStatus: CloudVideoUploadSessionStatus,
        throwOnFailure: Boolean = true,
    ): Boolean {
        val changed =
            sessionRepository.transitionStatus(
                id = sessionId,
                expectedStatus = expectedStatus,
                nextStatus = nextStatus,
                now = clock.instant(),
            ) == 1
        if (changed) {
            CloudMediaMetrics.recordSessionTransition(
                meterRegistry,
                from = expectedStatus.name,
                to = nextStatus.name,
            )
        }
        if (!changed && throwOnFailure) {
            throw AppException(ErrorCode.CLOUD_UPLOAD_CONFLICT, "대용량 업로드 세션 상태가 변경되었습니다.")
        }
        return changed
    }

    private fun markFailed(
        sessionId: Long,
        expectedStatus: CloudVideoUploadSessionStatus,
        reason: String,
    ): Int {
        val changed =
            sessionRepository.markFailed(
                id = sessionId,
                expectedStatus = expectedStatus,
                reason = reason.take(500),
                now = clock.instant(),
            )
        if (changed == 1) {
            CloudMediaMetrics.recordSessionTransition(
                meterRegistry,
                from = expectedStatus.name,
                to = CloudVideoUploadSessionStatus.FAILED.name,
            )
        }
        return changed
    }

    private fun releasePartUploadClaim(sessionId: Long) {
        transitionStatus(
            sessionId,
            expectedStatus = CloudVideoUploadSessionStatus.UPLOADING_PART,
            nextStatus = CloudVideoUploadSessionStatus.IN_PROGRESS,
            throwOnFailure = false,
        )
    }

    private fun abortOrFail(
        session: CloudVideoUploadSession,
        finalStatusOnFailure: CloudVideoUploadSessionStatus,
    ) {
        try {
            cloudStoragePort.abortMultipartUpload(
                CloudStoragePort.MultipartUploadAbortRequest(
                    objectKey = session.objectKey,
                    uploadId = requireUploadId(session),
                ),
            )
        } catch (ex: RuntimeException) {
            markFailed(session.id, finalStatusOnFailure, "multipart abort failed: ${ex.message}")
            throw ex
        }
    }

    private fun abortQuietly(
        objectKey: String,
        uploadId: String,
    ) {
        try {
            cloudStoragePort.abortMultipartUpload(
                CloudStoragePort.MultipartUploadAbortRequest(
                    objectKey = objectKey,
                    uploadId = uploadId,
                ),
            )
        } catch (ex: RuntimeException) {
            log.warn("Cloud video multipart upload abort compensation failed (objectKey={})", objectKey, ex)
        }
    }

    private fun requireUploadId(session: CloudVideoUploadSession): String =
        session.uploadId ?: throw AppException(ErrorCode.CLOUD_UPLOAD_CONFLICT, "대용량 업로드 세션 초기화가 완료되지 않았습니다.")

    private fun isTerminalStatus(status: CloudVideoUploadSessionStatus): Boolean =
        when (status) {
            CloudVideoUploadSessionStatus.COMPLETED,
            CloudVideoUploadSessionStatus.CANCELLED,
            CloudVideoUploadSessionStatus.EXPIRED,
            CloudVideoUploadSessionStatus.FAILED,
            -> true
            else -> false
        }

    private fun validateTotalSize(byteSize: Long) {
        if (byteSize <= 0) throw AppException(ErrorCode.BAD_REQUEST, "동영상 파일 크기가 올바르지 않습니다.")
        val maxBytes = cloudStorageProperties.cloudVideoResumableMaxFileSizeBytes
        if (byteSize > maxBytes) {
            throw AppException(ErrorCode.PAYLOAD_TOO_LARGE, "클라우드 동영상 파일은 ${formatFileSizeLimit(maxBytes)} 이하여야 합니다.")
        }
    }

    private fun resolveTotalParts(
        byteSize: Long,
        partSizeBytes: Long,
    ): Int {
        val totalParts = ((byteSize - 1) / partSizeBytes) + 1
        if (totalParts > CLOUD_VIDEO_UPLOAD_MAX_MULTIPART_PARTS) {
            throw AppException(ErrorCode.BAD_REQUEST, "대용량 동영상 업로드는 최대 10,000개 조각 이하여야 합니다.")
        }
        return totalParts.toInt()
    }

    private fun validatePartNumber(
        session: CloudVideoUploadSession,
        partNumber: Int,
    ) {
        if (partNumber !in 1..session.totalParts) {
            throw AppException(ErrorCode.BAD_REQUEST, "업로드 조각 번호가 올바르지 않습니다.")
        }
    }

    private fun validatePartSize(
        session: CloudVideoUploadSession,
        partNumber: Int,
        contentLength: Long,
    ) {
        if (contentLength <= 0) throw AppException(ErrorCode.BAD_REQUEST, "업로드 조각이 비어 있습니다.")
        val expectedSize =
            if (partNumber == session.totalParts) {
                session.byteSize - (session.partSizeBytes * (partNumber - 1))
            } else {
                session.partSizeBytes
            }
        if (contentLength != expectedSize) {
            throw AppException(ErrorCode.BAD_REQUEST, INVALID_PART_SIZE_MESSAGE)
        }
    }

    private data class BufferedUploadPart(
        val path: Path,
        val sha256Hex: String,
    )

    private fun copyPartToTempFile(
        inputStream: InputStream,
        expectedLength: Long,
    ): BufferedUploadPart {
        val tempFile = Files.createTempFile("cloud-upload-part-", ".tmp")
        try {
            val digest = MessageDigest.getInstance("SHA-256")
            val total = writeDigestedPartBytes(inputStream, tempFile, digest, expectedLength)
            if (total != expectedLength) {
                throw AppException(ErrorCode.BAD_REQUEST, INVALID_PART_SIZE_MESSAGE)
            }
            return BufferedUploadPart(path = tempFile, sha256Hex = digest.digest().toHex())
        } catch (ex: Exception) {
            deleteTempFileQuietly(tempFile)
            throw ex
        }
    }

    private fun writeDigestedPartBytes(
        inputStream: InputStream,
        tempFile: Path,
        digest: MessageDigest,
        expectedLength: Long,
    ): Long {
        var total = 0L
        inputStream.use { input ->
            DigestInputStream(input, digest).use { digesting ->
                Files.newOutputStream(tempFile).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = digesting.read(buffer)
                        if (read < 0) break
                        total += read
                        if (total > expectedLength) {
                            throw AppException(ErrorCode.BAD_REQUEST, INVALID_PART_SIZE_MESSAGE)
                        }
                        output.write(buffer, 0, read)
                    }
                }
            }
        }
        return total
    }

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

    private fun String.hexToByteArray(): ByteArray {
        require(length % 2 == 0) { "hex length must be even" }
        return ByteArray(length / 2) { index ->
            substring(index * 2, index * 2 + 2).toInt(16).toByte()
        }
    }

    private fun deleteTempFileQuietly(tempFile: Path) {
        runCatching { Files.deleteIfExists(tempFile) }
    }

    private fun validateFirstPartSignature(
        session: CloudVideoUploadSession,
        partNumber: Int,
        file: Path,
    ) {
        if (partNumber != 1) return
        val bytes = Files.newInputStream(file).use { it.readNBytes(12) }
        val detected =
            detectVideoFromSignature(bytes)
                ?: throw AppException(ErrorCode.BAD_REQUEST, "지원하지 않는 동영상 파일 형식입니다.")
        if (detected != session.contentType) {
            throw AppException(ErrorCode.BAD_REQUEST, "동영상 파일 내용과 콘텐츠 타입이 일치하지 않습니다.")
        }
    }

    private fun normalizeVideoContentType(
        contentType: String?,
        filename: String,
    ): String {
        val normalized =
            contentType
                ?.substringBefore(";")
                ?.trim()
                ?.lowercase(Locale.ROOT)
                .orEmpty()
        val extension = filename.substringAfterLast(".", "").lowercase(Locale.ROOT)
        val fromContentType =
            when (normalized) {
                "video/mp4", "application/mp4" -> "video/mp4"
                "video/webm" -> "video/webm"
                else -> null
            }
        val fromExtension =
            when (extension) {
                "mp4", "m4v", "mov" -> "video/mp4"
                "webm" -> "video/webm"
                else -> null
            }
        return fromContentType ?: fromExtension ?: throw AppException(ErrorCode.BAD_REQUEST, "지원하지 않는 동영상 파일 형식입니다.")
    }

    private fun detectVideoFromSignature(bytes: ByteArray): String? {
        if (bytes.size >= 12 && bytes.copyOfRange(4, 8).toString(Charsets.US_ASCII) == "ftyp") return "video/mp4"
        if (
            bytes.size >= 4 &&
            bytes[0] == 0x1A.toByte() &&
            bytes[1] == 0x45.toByte() &&
            bytes[2] == 0xDF.toByte() &&
            bytes[3] == 0xA3.toByte()
        ) {
            return "video/webm"
        }
        return null
    }

    private fun normalizeFolderPath(folderPath: String?): String {
        val raw = folderPath?.trim()?.trim('/').orEmpty()
        if (raw.isBlank()) return ""
        if (
            raw.contains("..") ||
            raw.contains("//") ||
            raw.startsWith("/") ||
            raw.split('/').any { it.isBlank() || it == "." || it == ".." }
        ) {
            throw AppException(ErrorCode.BAD_REQUEST, "유효하지 않은 폴더 경로입니다.")
        }

        return raw
            .split('/')
            .joinToString("/") { segment ->
                segment.replace(Regex("[^A-Za-z0-9._ -]"), "_").take(80)
            }.take(500)
    }

    private fun normalizeFilename(originalFilename: String?): String {
        val raw =
            originalFilename
                ?.substringAfterLast('/')
                ?.substringAfterLast('\\')
                ?.trim()
                .orEmpty()
        val decoded = recoverUtf8MojibakeFilename(raw)
        val cleaned =
            Normalizer
                .normalize(decoded, Normalizer.Form.NFC)
                .ifBlank { "cloud-video" }
                .replace(Regex("[\\r\\n\\t]"), " ")
                .replace(Regex("[/\\\\]"), "_")
                .replace(Regex("[\\p{Cc}\\p{Cf}\\p{Cs}]"), "")
                .replace(Regex("\\s+"), " ")
                .takeFilenameLimits()
                .trim()

        return cleaned.ifBlank { "cloud-video" }
    }

    private fun String.takeFilenameLimits(): String {
        val originalExtensionIndex = lastIndexOf(".").takeIf { it > 0 && it < lastIndex }
        val originalExtension =
            originalExtensionIndex
                ?.let(::substring)
                .orEmpty()
                .takeCodePoints(CLOUD_VIDEO_UPLOAD_MAX_FILENAME_CODE_POINTS - 1)
        val originalStem = originalExtensionIndex?.let { substring(0, it) } ?: this
        val maxStemCodePoints =
            CLOUD_VIDEO_UPLOAD_MAX_FILENAME_CODE_POINTS - originalExtension.codePointCount(0, originalExtension.length).toLong()
        val codePointLimited = originalStem.takeCodePoints(maxStemCodePoints.coerceAtLeast(0)) + originalExtension
        if (metadataEncodedLength(codePointLimited) <= CLOUD_VIDEO_UPLOAD_MAX_FILENAME_METADATA_ENCODED_BYTES) return codePointLimited

        val extensionIndex = codePointLimited.lastIndexOf(".").takeIf { it > 0 && it < codePointLimited.lastIndex }
        val extension =
            extensionIndex
                ?.let(codePointLimited::substring)
                .orEmpty()
                .takeMetadataEncodedBytes(CLOUD_VIDEO_UPLOAD_MAX_FILENAME_METADATA_ENCODED_BYTES)
        val stem = extensionIndex?.let { codePointLimited.substring(0, it) } ?: codePointLimited
        val maxStemBytes = CLOUD_VIDEO_UPLOAD_MAX_FILENAME_METADATA_ENCODED_BYTES - metadataEncodedLength(extension)
        val safeStem = stem.takeMetadataEncodedBytes(maxStemBytes.coerceAtLeast(0))
        return (safeStem + extension).ifBlank { takeMetadataEncodedBytes(CLOUD_VIDEO_UPLOAD_MAX_FILENAME_METADATA_ENCODED_BYTES) }
    }

    private fun String.takeMetadataEncodedBytes(maxEncodedBytes: Int): String {
        val builder = StringBuilder()
        val iterator = codePoints().iterator()
        while (iterator.hasNext()) {
            val next = iterator.nextInt()
            val candidate = StringBuilder(builder).appendCodePoint(next).toString()
            if (metadataEncodedLength(candidate) > maxEncodedBytes) break
            builder.appendCodePoint(next)
        }

        return builder.toString()
    }

    private fun String.takeCodePoints(maxCodePoints: Long): String {
        val codePoints = codePoints().limit(maxCodePoints).toArray()
        return String(codePoints, 0, codePoints.size)
    }

    private fun metadataEncodedLength(value: String): Int =
        URLEncoder
            .encode(value, StandardCharsets.UTF_8)
            .replace("+", "%20")
            .toByteArray(StandardCharsets.US_ASCII)
            .size

    private fun recoverUtf8MojibakeFilename(raw: String): String {
        if (raw.isBlank()) return raw
        if (raw.any { it in '가'..'힣' }) return raw
        val recovered =
            runCatching {
                String(raw.toByteArray(StandardCharsets.ISO_8859_1), StandardCharsets.UTF_8)
            }.getOrDefault(raw)
        if (recovered == raw || recovered.contains('\uFFFD')) return raw
        val rawHangulCount = raw.count { it in '가'..'힣' }
        val recoveredHangulCount = recovered.count { it in '가'..'힣' }
        return if (recoveredHangulCount > rawHangulCount) recovered else raw
    }

    private fun buildObjectKey(
        ownerMemberId: Long,
        folderPath: String,
        originalFilename: String,
    ): String {
        val ext = extractExtension(originalFilename)
        val datePath = CLOUD_VIDEO_UPLOAD_DATE_PATH_FORMATTER.format(clock.instant().atZone(ZoneOffset.UTC))
        val folderSegment = folderPath.takeIf(String::isNotBlank)?.let { "$it/" }.orEmpty()
        val keyPrefix = normalizeObjectKeyPrefix(cloudStorageProperties.cloudKeyPrefix)
        return "$keyPrefix/$ownerMemberId/$folderSegment$datePath/${UUID.randomUUID()}$ext"
    }

    private fun normalizeObjectKeyPrefix(prefix: String): String =
        prefix
            .trim()
            .trim('/')
            .ifBlank { "cloud" }

    private fun extractExtension(filename: String): String {
        if (!filename.contains(".")) return ""
        val ext =
            filename
                .substringAfterLast(".")
                .lowercase(Locale.ROOT)
                .replace(Regex("[^a-z0-9]"), "")
                .take(10)
        return if (ext.isBlank()) "" else ".$ext"
    }

    private fun resolvePartSizeBytes(): Long {
        val configured = cloudStorageProperties.cloudVideoResumablePartSizeBytes
        val minPartBytes = 5L * 1024 * 1024
        val maxPartBytes = cloudStorageProperties.maxFileSizeBytes.coerceAtLeast(minPartBytes)
        return configured.coerceIn(minPartBytes, maxPartBytes)
    }

    private fun formatFileSizeLimit(maxFileSizeBytes: Long): String {
        val units = listOf("B", "KB", "MB", "GB")
        var value = maxFileSizeBytes.toDouble()
        var unitIndex = 0
        while (value >= 1024 && unitIndex < units.lastIndex) {
            value /= 1024
            unitIndex++
        }
        val formatted = if (value % 1.0 == 0.0) value.toLong().toString() else "%.1f".format(Locale.US, value)
        return "$formatted ${units[unitIndex]}"
    }

    private fun CloudVideoUploadSession.toDto(parts: List<CloudVideoUploadPart>): CloudVideoUploadSessionDto =
        CloudVideoUploadSessionDto(
            id = id,
            ownerMemberId = ownerMemberId,
            originalFilename = originalFilename,
            contentType = contentType,
            byteSize = byteSize,
            folderPath = folderPath,
            partSizeBytes = partSizeBytes,
            totalParts = totalParts,
            uploadedParts = parts.map { it.partNumber }.sorted(),
            status = status,
            expiresAt = expiresAt,
            completedFileId = completedFileId,
            failureReason = failureReason,
        )

    private fun CloudVideoUploadPart.toDto(): CloudVideoUploadPartDto =
        CloudVideoUploadPartDto(
            partNumber = partNumber,
            byteSize = byteSize,
        )

    private fun CloudFile.toDto(): CloudFileDto =
        CloudFileDto(
            id = id,
            ownerMemberId = ownerMemberId,
            originalFilename = originalFilename,
            contentType = contentType,
            byteSize = byteSize,
            mediaKind = mediaKind,
            folderPath = folderPath,
            createdAt = runCatching { createdAt }.getOrDefault(clock.instant()),
            modifiedAt = runCatching { modifiedAt }.getOrDefault(clock.instant()),
        )
}
