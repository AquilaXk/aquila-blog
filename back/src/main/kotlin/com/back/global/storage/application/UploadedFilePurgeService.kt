package com.back.global.storage.application

import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.config.PostImageStorageProperties
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
    private val storageProperties: PostImageStorageProperties,
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
        val reconcileDiagnostics = diagnoseReconcile(now, safeSampleSize)

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
            reconcile = reconcileDiagnostics,
        )
    }

    private fun diagnoseReconcile(
        now: Instant,
        sampleSize: Int,
    ): UploadedFileReconcileDiagnostics {
        val objectPrefix = resolveReconcilePrefix()
        val inventoryLimit = retentionProperties.reconcileInventoryLimit.coerceIn(1, MAX_RECONCILE_INVENTORY_LIMIT)
        val inventory =
            runCatching { postImageStoragePort.listObjects(objectPrefix, inventoryLimit) }
                .getOrElse { exception ->
                    logger.warn(
                        "Skip uploaded file reconcile inventory because object storage listing failed (prefix={})",
                        objectPrefix,
                        exception,
                    )
                    return degradedReconcileDiagnostics(
                        objectPrefix = objectPrefix,
                        inventoryLimit = inventoryLimit,
                    )
                }
        val inventoryObjectKeys = inventory.objects.map { it.objectKey }
        val uploadedFilesByKey =
            if (inventoryObjectKeys.isEmpty()) {
                emptyMap()
            } else {
                uploadedFileRepository
                    .findByObjectKeyIn(inventoryObjectKeys)
                    .associateBy { it.objectKey }
            }
        val bucketOnlyObjectKeys =
            inventoryObjectKeys
                .filterNot(uploadedFilesByKey::containsKey)
                .take(sampleSize)

        val dbRows =
            uploadedFileRepository.findByStatusInAndObjectKeyStartingWithOrderByIdAsc(
                statuses = activeStorageStatuses,
                objectKeyPrefix = objectPrefix,
                pageable = PageRequest.of(0, inventoryLimit + 1),
            )
        val dbRowsTruncated = dbRows.size > inventoryLimit
        val sampledDbRows = dbRows.take(inventoryLimit)
        val dbOnlyMissingObjectKeys =
            if (inventory.isTruncated) {
                emptyList()
            } else {
                val inventorySet = inventoryObjectKeys.toSet()
                sampledDbRows
                    .map { it.objectKey }
                    .filterNot(inventorySet::contains)
            }
        val longLivedPendingDeleteCutoff = now.minusSeconds(retentionProperties.longPendingDeleteSeconds.coerceAtLeast(1))
        val longLivedPendingDeleteCandidates =
            uploadedFileRepository.findByStatusInAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
                statuses = listOf(UploadedFileStatus.PENDING_DELETE),
                purgeAfter = longLivedPendingDeleteCutoff,
                pageable = PageRequest.of(0, sampleSize),
            )
        val longLivedPendingDeleteCount =
            uploadedFileRepository.countByStatusInAndPurgeAfterLessThanEqual(
                statuses = listOf(UploadedFileStatus.PENDING_DELETE),
                purgeAfter = longLivedPendingDeleteCutoff,
            )

        return UploadedFileReconcileDiagnostics(
            objectPrefix = objectPrefix,
            inventoryLimit = inventoryLimit,
            inventoryObjectCount = inventory.objects.size,
            inventoryTruncated = inventory.isTruncated,
            dbRowsTruncated = dbRowsTruncated,
            bucketOnlyObjectCount = inventoryObjectKeys.size - uploadedFilesByKey.size,
            sampleBucketOnlyObjectKeys = bucketOnlyObjectKeys,
            dbOnlyMissingObjectCount = dbOnlyMissingObjectKeys.size,
            sampleDbOnlyObjectKeys = dbOnlyMissingObjectKeys.take(sampleSize),
            longLivedPendingDeleteCount = longLivedPendingDeleteCount,
            sampleLongLivedPendingDeleteObjectKeys = longLivedPendingDeleteCandidates.map { it.objectKey },
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

    private fun resolveReconcilePrefix(): String =
        normalizeReconcilePrefix(
            retentionProperties.reconcileObjectPrefix.ifBlank { storageProperties.keyPrefix },
        )

    private fun normalizeReconcilePrefix(prefix: String): String =
        prefix
            .trim()
            .trimStart('/')
            .let { if (it.isBlank() || it.endsWith("/")) it else "$it/" }

    private fun degradedReconcileDiagnostics(
        objectPrefix: String,
        inventoryLimit: Int,
    ): UploadedFileReconcileDiagnostics =
        UploadedFileReconcileDiagnostics(
            objectPrefix = objectPrefix,
            inventoryLimit = inventoryLimit,
            inventoryObjectCount = 0,
            inventoryAvailable = false,
            inventoryTruncated = false,
            dbRowsTruncated = false,
            bucketOnlyObjectCount = 0,
            sampleBucketOnlyObjectKeys = emptyList(),
            dbOnlyMissingObjectCount = 0,
            sampleDbOnlyObjectKeys = emptyList(),
            longLivedPendingDeleteCount = 0,
            sampleLongLivedPendingDeleteObjectKeys = emptyList(),
            repairMode = "dry-run-degraded",
        )

    companion object {
        private const val MAX_RECONCILE_INVENTORY_LIMIT = 1_000
        private val activeStorageStatuses =
            listOf(
                UploadedFileStatus.TEMP,
                UploadedFileStatus.ACTIVE,
                UploadedFileStatus.PENDING_DELETE,
            )
    }
}
