package com.back.global.storage.application

import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileStatus
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant

@Service
class UploadedFilePurgeService(
    private val uploadedFileRepository: UploadedFileRepositoryPort,
    private val postImageStoragePort: PostImageStoragePort,
    private val retentionProperties: UploadedFileRetentionProperties,
    private val referenceQueryService: UploadedFileReferenceQueryService,
    private val transactionManager: PlatformTransactionManager,
    private val clock: Clock,
) {
    private val logger = LoggerFactory.getLogger(UploadedFilePurgeService::class.java)
    private val purgeCandidateStatuses = listOf(UploadedFileStatus.TEMP, UploadedFileStatus.PENDING_DELETE)
    private val readOnlyTransactionTemplate =
        TransactionTemplate(transactionManager).apply {
            propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRED
            isReadOnly = true
        }
    private val writeTransactionTemplate = TransactionTemplate(transactionManager)

    fun purgeExpiredFiles(limit: Int) {
        val safeLimit = limit.coerceIn(1, 500)
        val safetyThreshold = retentionProperties.cleanupSafetyThreshold.coerceAtLeast(1)
        val now = now()
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

        val candidates = loadPurgeCandidates(now, effectiveLimit)
        if (candidates.isEmpty()) {
            logger.debug(
                "No uploaded files eligible for purge (eligibleCount={}, effectiveLimit={})",
                eligibleCount,
                effectiveLimit,
            )
            return
        }

        val referencedObjectKeys = referenceQueryService.findReferencedObjectKeys(candidates)
        candidates.forEach { uploadedFile ->
            if (uploadedFile.objectKey in referencedObjectKeys) {
                restoreActive(uploadedFile.objectKey)
                return@forEach
            }

            try {
                postImageStoragePort.deletePostImage(uploadedFile.objectKey)
                markDeleted(uploadedFile.objectKey)
            } catch (exception: Exception) {
                logger.error("Failed to purge uploaded file: {}", uploadedFile.objectKey, exception)
            }
        }
    }

    fun diagnoseCleanup(sampleSize: Int): UploadedFileCleanupDiagnostics {
        val now = now()
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
            blockedBySafetyThreshold = eligibleCount > retentionProperties.cleanupSafetyThreshold,
            oldestEligiblePurgeAfter = eligibleCandidates.firstOrNull()?.purgeAfter,
            sampleEligibleObjectKeys = eligibleCandidates.map { it.objectKey },
        )
    }

    private fun loadPurgeCandidates(
        now: Instant,
        effectiveLimit: Int,
    ): List<UploadedFile> =
        readOnlyTransactionTemplate.execute<List<UploadedFile>> {
            uploadedFileRepository.findByStatusInAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
                statuses = purgeCandidateStatuses,
                purgeAfter = now,
                pageable = PageRequest.of(0, effectiveLimit),
            )
        } ?: emptyList()

    private fun restoreActive(objectKey: String) {
        writeTransactionTemplate.executeWithoutResult {
            val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey) ?: return@executeWithoutResult
            uploadedFile.restoreActive()
            uploadedFileRepository.save(uploadedFile)
        }
    }

    private fun markDeleted(objectKey: String) {
        writeTransactionTemplate.executeWithoutResult {
            val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey) ?: return@executeWithoutResult
            uploadedFile.markDeleted()
            uploadedFileRepository.save(uploadedFile)
        }
    }

    private fun now(): Instant = Instant.now(clock)
}
