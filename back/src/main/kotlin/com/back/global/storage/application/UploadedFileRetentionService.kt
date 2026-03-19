package com.back.global.storage.application

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileOwnerType
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileRetentionReason
import com.back.global.storage.domain.UploadedFileStatus
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
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
) {
    private val logger = LoggerFactory.getLogger(UploadedFileRetentionService::class.java)
    private val purgeCandidateStatuses = listOf(UploadedFileStatus.TEMP, UploadedFileStatus.PENDING_DELETE)

    @Transactional
    fun registerTempUpload(
        objectKey: String,
        contentType: String,
        fileSize: Long,
        purpose: UploadedFilePurpose,
    ) {
        val uploadedFile =
            findOrCreate(objectKey).apply {
                bucket = storageProperties.bucket
                this.contentType = contentType.ifBlank { "application/octet-stream" }
                this.fileSize = fileSize.coerceAtLeast(0)
                markTemporary(purpose, Instant.now().plusSeconds(retentionProperties.tempUploadSeconds))
            }

        uploadedFileRepository.save(uploadedFile)
    }

    /**
     * 데이터 동기화 또는 리밸리데이션 요청을 조정해 최신 상태를 유지합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    @Transactional
    fun syncPostContent(
        postId: Int,
        previousContent: String?,
        currentContent: String,
    ) {
        val previousKeys = UploadedFileUrlCodec.extractObjectKeysFromContent(previousContent.orEmpty())
        val currentKeys = UploadedFileUrlCodec.extractObjectKeysFromContent(currentContent)

        currentKeys.forEach { objectKey ->
            val uploadedFile = findOrCreate(objectKey)
            uploadedFile.attachToPost(postId)
            uploadedFileRepository.save(uploadedFile)
        }

        (previousKeys - currentKeys).forEach { objectKey ->
            scheduleDeletionIfKnown(
                objectKey = objectKey,
                purpose = UploadedFilePurpose.POST_IMAGE,
                reason = UploadedFileRetentionReason.DETACHED_POST_ATTACHMENT,
                purgeAfter = Instant.now().plusSeconds(retentionProperties.deletedPostAttachmentSeconds),
            )
        }
    }

    @Transactional
    fun scheduleDeletedPostAttachments(content: String) {
        UploadedFileUrlCodec.extractObjectKeysFromContent(content).forEach { objectKey ->
            scheduleDeletionIfKnown(
                objectKey = objectKey,
                purpose = UploadedFilePurpose.POST_IMAGE,
                reason = UploadedFileRetentionReason.DELETED_POST_ATTACHMENT,
                purgeAfter = Instant.now().plusSeconds(retentionProperties.deletedPostAttachmentSeconds),
            )
        }
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

    /**
     * 데이터 동기화 또는 리밸리데이션 요청을 조정해 최신 상태를 유지합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    @Transactional
    fun syncProfileImage(
        memberId: Int,
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
        return postRepository.existsByContentContaining(objectKey) ||
            memberAttrRepository.existsByNameAndStrValueContaining(PROFILE_IMG_URL, objectKey) ||
            memberAttrRepository.existsByNameAndStrValue(PROFILE_IMG_URL, imageUrl)
    }
}
