package com.back.global.storage.application

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.jpa.application.ProdSequenceGuardService
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileOwnerType
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileRetentionReason
import com.back.global.storage.domain.UploadedFileStatus
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

/**
 * UploadedFileCleanupDiagnostics는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
data class UploadedFileCleanupDiagnostics(
    val tempCount: Long,
    val activeCount: Long,
    val pendingDeleteCount: Long,
    val deletedCount: Long,
    val eligibleForPurgeCount: Long,
    val cleanupSafetyThreshold: Int,
    val blockedBySafetyThreshold: Boolean,
    val oldestEligiblePurgeAfter: Instant?,
    val sampleEligibleObjectKeys: List<String>,
)

/**
 * UploadedFileRetentionService는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */

@Service
class UploadedFileRetentionService(
    private val uploadedFileRepository: UploadedFileRepositoryPort,
    private val postRepository: PostRepositoryPort,
    private val memberAttrRepository: MemberAttrRepositoryPort,
    private val postImageStoragePort: PostImageStoragePort,
    private val storageProperties: PostImageStorageProperties,
    private val retentionProperties: UploadedFileRetentionProperties,
    private val transactionManager: PlatformTransactionManager,
    @param:Autowired(required = false)
    private val prodSequenceGuardService: ProdSequenceGuardService? = null,
) {
    private val logger = LoggerFactory.getLogger(UploadedFileRetentionService::class.java)
    private val purgeCandidateStatuses = listOf(UploadedFileStatus.TEMP, UploadedFileStatus.PENDING_DELETE)
    private val registerRetryLimit = 2
    private val requiresNewTransactionTemplate =
        TransactionTemplate(transactionManager).apply {
            propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
        }

    fun registerTempUpload(
        objectKey: String,
        contentType: String,
        fileSize: Long,
        purpose: UploadedFilePurpose,
    ) {
        val normalizedContentType = contentType.ifBlank { "application/octet-stream" }
        val safeFileSize = fileSize.coerceAtLeast(0)
        val purgeAfter = Instant.now().plusSeconds(retentionProperties.tempUploadSeconds)

        for (attempt in 1..registerRetryLimit) {
            try {
                saveTempUploadInRequiresNewTransaction(
                    objectKey = objectKey,
                    normalizedContentType = normalizedContentType,
                    safeFileSize = safeFileSize,
                    purpose = purpose,
                    purgeAfter = purgeAfter,
                )
                return
            } catch (exception: DataIntegrityViolationException) {
                if (
                    recoverTempUploadFromExistingObjectKey(
                        objectKey = objectKey,
                        normalizedContentType = normalizedContentType,
                        safeFileSize = safeFileSize,
                        purpose = purpose,
                        purgeAfter = purgeAfter,
                    )
                ) {
                    return
                }

                val repaired = repairSequenceDriftInRequiresNewTransaction(exception)
                logger.warn(
                    "uploaded_file_register_conflict objectKey={} attempt={} repaired={}",
                    objectKey,
                    attempt,
                    repaired,
                )
                if (!repaired || attempt >= registerRetryLimit) throw exception
            }
        }
    }

    private fun saveTempUploadInRequiresNewTransaction(
        objectKey: String,
        normalizedContentType: String,
        safeFileSize: Long,
        purpose: UploadedFilePurpose,
        purgeAfter: Instant,
    ) {
        requiresNewTransactionTemplate.executeWithoutResult {
            val uploadedFile =
                findOrCreate(objectKey).apply {
                    bucket = storageProperties.bucket
                    this.contentType = normalizedContentType
                    this.fileSize = safeFileSize
                    markTemporary(purpose, purgeAfter)
                }
            uploadedFileRepository.save(uploadedFile)
            uploadedFileRepository.flush()
        }
    }

    private fun recoverTempUploadFromExistingObjectKey(
        objectKey: String,
        normalizedContentType: String,
        safeFileSize: Long,
        purpose: UploadedFilePurpose,
        purgeAfter: Instant,
    ): Boolean =
        requiresNewTransactionTemplate.execute<Boolean> {
            val existing = uploadedFileRepository.findByObjectKey(objectKey) ?: return@execute false
            existing.bucket = storageProperties.bucket
            existing.contentType = normalizedContentType
            existing.fileSize = safeFileSize
            existing.markTemporary(purpose, purgeAfter)
            uploadedFileRepository.save(existing)
            uploadedFileRepository.flush()
            true
        } ?: false

    private fun repairSequenceDriftInRequiresNewTransaction(exception: DataIntegrityViolationException): Boolean =
        requiresNewTransactionTemplate.execute<Boolean> {
            prodSequenceGuardService?.repairIfSequenceDrift(exception) == true
        } ?: false

    /**
     * 데이터 동기화 또는 리밸리데이션 요청을 조정해 최신 상태를 유지합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    @Transactional
    fun syncPostContent(
        postId: Long,
        previousContent: String?,
        currentContent: String,
    ) {
        syncPostAttachmentKeys(
            postId = postId,
            currentKeys = UploadedFileUrlCodec.extractImageObjectKeysFromContent(currentContent),
            previousKeys = UploadedFileUrlCodec.extractImageObjectKeysFromContent(previousContent.orEmpty()),
            purpose = UploadedFilePurpose.POST_IMAGE,
        )
        syncPostAttachmentKeys(
            postId = postId,
            currentKeys = UploadedFileUrlCodec.extractFileObjectKeysFromContent(currentContent),
            previousKeys = UploadedFileUrlCodec.extractFileObjectKeysFromContent(previousContent.orEmpty()),
            purpose = UploadedFilePurpose.POST_FILE,
        )
    }

    @Transactional
    fun scheduleDeletedPostAttachments(content: String) {
        scheduleDeletionForContent(
            purpose = UploadedFilePurpose.POST_IMAGE,
            keys = UploadedFileUrlCodec.extractImageObjectKeysFromContent(content),
        )
        scheduleDeletionForContent(
            purpose = UploadedFilePurpose.POST_FILE,
            keys = UploadedFileUrlCodec.extractFileObjectKeysFromContent(content),
        )
    }

    /**
     * restoreDeletedPostAttachments 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    @Transactional
    fun restoreDeletedPostAttachments(content: String) {
        UploadedFileUrlCodec.extractObjectKeysFromContent(content).forEach { objectKey ->
            val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey) ?: return@forEach
            if (uploadedFile.status == UploadedFileStatus.DELETED) return@forEach
            uploadedFile.restoreActive()
            uploadedFileRepository.save(uploadedFile)
        }
    }

    private fun syncPostAttachmentKeys(
        postId: Long,
        currentKeys: Set<String>,
        previousKeys: Set<String>,
        purpose: UploadedFilePurpose,
    ) {
        currentKeys.forEach { objectKey ->
            val uploadedFile = findOrCreate(objectKey)
            uploadedFile.attachToPost(postId, purpose)
            uploadedFileRepository.save(uploadedFile)
        }

        (previousKeys - currentKeys).forEach { objectKey ->
            scheduleDeletionIfKnown(
                objectKey = objectKey,
                purpose = purpose,
                reason = UploadedFileRetentionReason.DETACHED_POST_ATTACHMENT,
                purgeAfter = Instant.now().plusSeconds(retentionProperties.deletedPostAttachmentSeconds),
            )
        }
    }

    private fun scheduleDeletionForContent(
        keys: Set<String>,
        purpose: UploadedFilePurpose,
    ) {
        keys.forEach { objectKey ->
            scheduleDeletionIfKnown(
                objectKey = objectKey,
                purpose = purpose,
                reason = UploadedFileRetentionReason.DELETED_POST_ATTACHMENT,
                purgeAfter = Instant.now().plusSeconds(retentionProperties.deletedPostAttachmentSeconds),
            )
        }
    }

    /**
     * 데이터 동기화 또는 리밸리데이션 요청을 조정해 최신 상태를 유지합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    @Transactional
    fun syncProfileImage(
        memberId: Long,
        previousProfileImgUrl: String?,
        currentProfileImgUrl: String?,
    ) {
        val previousObjectKey = UploadedFileUrlCodec.extractObjectKeyFromImageUrl(previousProfileImgUrl)
        val currentObjectKey = UploadedFileUrlCodec.extractObjectKeyFromImageUrl(currentProfileImgUrl)

        currentObjectKey?.let { objectKey ->
            val uploadedFile = findOrCreate(objectKey)
            uploadedFile.attachToMemberProfile(memberId)
            uploadedFileRepository.save(uploadedFile)
        }

        if (previousObjectKey != null && previousObjectKey != currentObjectKey) {
            scheduleDeletionIfKnown(
                objectKey = previousObjectKey,
                purpose = UploadedFilePurpose.PROFILE_IMAGE,
                reason = UploadedFileRetentionReason.REPLACED_PROFILE_IMAGE,
                purgeAfter = Instant.now().plusSeconds(retentionProperties.replacedProfileImageSeconds),
            )
        }
    }

    /**
     * 만료/중단 상태를 정리해 리소스와 큐 정합성을 유지합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    @Transactional
    fun purgeExpiredFiles(limit: Int) {
        val safeLimit = limit.coerceIn(1, 500)
        val safetyThreshold = retentionProperties.cleanupSafetyThreshold.coerceAtLeast(1)
        val now = Instant.now()
        val eligibleCount =
            uploadedFileRepository.countByStatusInAndPurgeAfterLessThanEqual(
                purgeCandidateStatuses,
                now,
            )

        val effectiveLimit =
            if (eligibleCount > safetyThreshold) {
                logger.warn(
                    "Throttling uploaded file purge because eligible candidate count {} exceeds safety threshold {}",
                    eligibleCount,
                    safetyThreshold,
                )
                minOf(safeLimit, safetyThreshold)
            } else {
                safeLimit
            }

        if (effectiveLimit <= 0) {
            logger.error(
                "Skipping uploaded file purge because effective limit is non-positive (safeLimit={}, threshold={})",
                safeLimit,
                safetyThreshold,
            )
            return
        }

        val candidates =
            uploadedFileRepository.findByStatusInAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
                statuses = purgeCandidateStatuses,
                purgeAfter = now,
                pageable = PageRequest.of(0, effectiveLimit),
            )

        if (candidates.isEmpty()) {
            logger.debug(
                "No uploaded files eligible for purge (eligibleCount={}, effectiveLimit={})",
                eligibleCount,
                effectiveLimit,
            )
            return
        }

        candidates.forEach { uploadedFile ->
            if (isStillReferenced(uploadedFile)) {
                uploadedFile.restoreActive()
                uploadedFileRepository.save(uploadedFile)
                return@forEach
            }

            try {
                postImageStoragePort.deletePostImage(uploadedFile.objectKey)
                uploadedFile.markDeleted()
                uploadedFileRepository.save(uploadedFile)
            } catch (exception: Exception) {
                logger.error("Failed to purge uploaded file: {}", uploadedFile.objectKey, exception)
            }
        }
    }

    /**
     * diagnoseCleanup 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    @Transactional(readOnly = true)
    fun diagnoseCleanup(sampleSize: Int = 5): UploadedFileCleanupDiagnostics {
        val now = Instant.now()
        val safeSampleSize = sampleSize.coerceIn(1, 20)
        val eligibleCandidates =
            uploadedFileRepository.findByStatusInAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
                statuses = purgeCandidateStatuses,
                purgeAfter = now,
                pageable = PageRequest.of(0, safeSampleSize),
            )

        val eligibleCount =
            uploadedFileRepository.countByStatusInAndPurgeAfterLessThanEqual(
                purgeCandidateStatuses,
                now,
            )

        return UploadedFileCleanupDiagnostics(
            tempCount = uploadedFileRepository.countByStatus(UploadedFileStatus.TEMP),
            activeCount = uploadedFileRepository.countByStatus(UploadedFileStatus.ACTIVE),
            pendingDeleteCount = uploadedFileRepository.countByStatus(UploadedFileStatus.PENDING_DELETE),
            deletedCount = uploadedFileRepository.countByStatus(UploadedFileStatus.DELETED),
            eligibleForPurgeCount = eligibleCount,
            cleanupSafetyThreshold = retentionProperties.cleanupSafetyThreshold,
            // 임계치 초과 시 전체 중단 대신 배치 제한으로 완만히 정리한다.
            blockedBySafetyThreshold = eligibleCount > retentionProperties.cleanupSafetyThreshold,
            oldestEligiblePurgeAfter = eligibleCandidates.firstOrNull()?.purgeAfter,
            sampleEligibleObjectKeys = eligibleCandidates.map { it.objectKey },
        )
    }

    /**
     * scheduleDeletionIfKnown 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    private fun scheduleDeletionIfKnown(
        objectKey: String,
        purpose: UploadedFilePurpose,
        reason: UploadedFileRetentionReason,
        purgeAfter: Instant,
    ) {
        if (objectKey.isBlank()) return

        // legacy 본문에는 업로드 추적 테이블에 없는 이미지 URL이 섞여 있을 수 있다.
        // 삭제 예약 단계에서는 미등록 키를 새로 생성하지 않고, 추적 중인 파일만 상태 전환한다.
        val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey) ?: return
        uploadedFile.purpose = purpose
        uploadedFile.scheduleDeletion(reason, purgeAfter)
        uploadedFileRepository.save(uploadedFile)
    }

    private fun findOrCreate(objectKey: String): UploadedFile =
        uploadedFileRepository.findByObjectKey(objectKey)
            ?: UploadedFile(
                objectKey = objectKey,
                bucket = storageProperties.bucket,
                contentType = "application/octet-stream",
                fileSize = 0,
            )

    /**
     * 정책 조건을 검증해 처리 가능 여부를 판정합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    private fun isStillReferenced(uploadedFile: UploadedFile): Boolean {
        val objectKey = uploadedFile.objectKey
        val ownerId = uploadedFile.ownerId

        if (uploadedFile.ownerType == UploadedFileOwnerType.POST && ownerId != null) {
            if (postRepository.existsByIdAndContentContaining(ownerId, objectKey)) {
                return true
            }
        }

        if (uploadedFile.ownerType == UploadedFileOwnerType.MEMBER_PROFILE && ownerId != null) {
            if (memberAttrRepository.existsBySubjectIdAndNameAndStrValueContaining(ownerId, PROFILE_IMG_URL, objectKey)) {
                return true
            }
        }

        val imageUrl = UploadedFileUrlCodec.buildImageUrl(objectKey)
        val fileUrl = UploadedFileUrlCodec.buildFileUrl(objectKey)
        return postRepository.existsByContentContaining(objectKey) ||
            postRepository.existsByContentContaining(fileUrl) ||
            memberAttrRepository.existsByNameAndStrValueContaining(PROFILE_IMG_URL, objectKey) ||
            memberAttrRepository.existsByNameAndStrValue(PROFILE_IMG_URL, imageUrl)
    }
}
