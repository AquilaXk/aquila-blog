package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.application.port.output.CloudVideoUploadSessionRepositoryPort
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Clock

data class CloudFileReconcileDiagnostics(
    val objectPrefix: String,
    val inventoryLimit: Int,
    val inventoryObjectCount: Int,
    val inventoryAvailable: Boolean = true,
    val inventoryTruncated: Boolean,
    val dbRowsTruncated: Boolean = false,
    val bucketOnlyObjectCount: Int,
    val sampleBucketOnlyObjectKeys: List<String>,
    val dbOnlyMissingObjectCount: Int,
    val sampleDbOnlyObjectKeys: List<String>,
    val repairedBucketOnlyDeletedCount: Int = 0,
    val repairedDbOnlySoftDeletedCount: Int = 0,
    val blockedBySafetyThreshold: Boolean = false,
    val repairMode: String = "dry-run",
)

/**
 * cloud_file 메타 ↔ `cloud/` prefix 스토리지 객체를 양방향 대사한다.
 * 기본은 dry-run(감지·메트릭만). repair는 명시적으로 켠 경우에만 수행한다.
 */
@Service
class CloudFileReconcileService(
    private val cloudStoragePort: CloudStoragePort,
    private val cloudFileRepository: CloudFileRepositoryPort,
    private val sessionRepository: CloudVideoUploadSessionRepositoryPort,
    private val cloudStorageProperties: CloudStorageProperties,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun diagnose(sampleSize: Int = 5): CloudFileReconcileDiagnostics = reconcile(sampleSize = sampleSize, repair = false)

    fun reconcile(): CloudFileReconcileDiagnostics =
        reconcile(
            sampleSize = 5,
            repair = cloudStorageProperties.cloudReconcileRepairEnabled,
        )

    fun reconcile(
        sampleSize: Int,
        repair: Boolean,
    ): CloudFileReconcileDiagnostics {
        val objectPrefix = normalizePrefix(cloudStorageProperties.cloudKeyPrefix)
        val inventoryLimit = cloudStorageProperties.cloudReconcileInventoryLimit.coerceIn(1, MAX_INVENTORY_LIMIT)
        val safeSampleSize = sampleSize.coerceIn(1, 20)
        val now = clock.instant()
        val graceCutoff = now.minusSeconds(cloudStorageProperties.cloudReconcileObjectGraceSeconds.coerceAtLeast(1))

        val inventory =
            runCatching { cloudStoragePort.listObjects(objectPrefix, inventoryLimit) }
                .getOrElse { exception ->
                    log.warn(
                        "Skip cloud_file reconcile inventory because object storage listing failed (prefix={})",
                        objectPrefix,
                        exception,
                    )
                    return degradedDiagnostics(objectPrefix, inventoryLimit)
                }

        val inFlightObjectKeys =
            sessionRepository
                .findNonTerminalObjectKeysByPrefix(objectPrefix, inventoryLimit)
                .toSet()

        val dbRows =
            cloudFileRepository.findActiveByObjectKeyStartingWith(
                objectKeyPrefix = objectPrefix,
                limit = inventoryLimit + 1,
            )
        val dbRowsTruncated = dbRows.size > inventoryLimit
        val sampledDbRows = dbRows.take(inventoryLimit)
        val dbByKey = sampledDbRows.associateBy { it.objectKey }

        val orphanBucketObjects =
            inventory.objects.filter { summary ->
                val key = summary.objectKey
                if (dbByKey.containsKey(key) || key in inFlightObjectKeys) {
                    return@filter false
                }
                val lastModified = summary.lastModified
                lastModified != null && lastModified <= graceCutoff
            }
        val orphanDbRows =
            if (inventory.isTruncated) {
                emptyList()
            } else {
                val inventoryKeys = inventory.objects.map { it.objectKey }.toSet()
                sampledDbRows.filterNot { it.objectKey in inventoryKeys }
            }

        val repairMode =
            when {
                !repair -> "dry-run"
                orphanBucketObjects.size > cloudStorageProperties.cloudReconcileSafetyThreshold -> "dry-run-blocked"
                else -> "repair"
            }
        val blockedBySafetyThreshold =
            repair && orphanBucketObjects.size > cloudStorageProperties.cloudReconcileSafetyThreshold

        var repairedBucketOnlyDeletedCount = 0
        var repairedDbOnlySoftDeletedCount = 0
        if (repairMode == "repair") {
            orphanBucketObjects.forEach { summary ->
                runCatching {
                    cloudStoragePort.delete(summary.objectKey)
                    repairedBucketOnlyDeletedCount++
                }.onFailure {
                    log.warn(
                        "Cloud reconcile orphan object delete failed (objectKey={})",
                        summary.objectKey,
                        it,
                    )
                }
            }
            orphanDbRows.forEach { file ->
                runCatching {
                    file.markDeleted(now)
                    cloudFileRepository.save(file)
                    repairedDbOnlySoftDeletedCount++
                }.onFailure {
                    log.warn(
                        "Cloud reconcile orphan metadata soft-delete failed (objectKey={})",
                        file.objectKey,
                        it,
                    )
                }
            }
        }

        return CloudFileReconcileDiagnostics(
            objectPrefix = objectPrefix,
            inventoryLimit = inventoryLimit,
            inventoryObjectCount = inventory.objects.size,
            inventoryAvailable = true,
            inventoryTruncated = inventory.isTruncated,
            dbRowsTruncated = dbRowsTruncated,
            bucketOnlyObjectCount = orphanBucketObjects.size,
            sampleBucketOnlyObjectKeys = orphanBucketObjects.map { it.objectKey }.take(safeSampleSize),
            dbOnlyMissingObjectCount = orphanDbRows.size,
            sampleDbOnlyObjectKeys = orphanDbRows.map { it.objectKey }.take(safeSampleSize),
            repairedBucketOnlyDeletedCount = repairedBucketOnlyDeletedCount,
            repairedDbOnlySoftDeletedCount = repairedDbOnlySoftDeletedCount,
            blockedBySafetyThreshold = blockedBySafetyThreshold,
            repairMode = repairMode,
        )
    }

    private fun degradedDiagnostics(
        objectPrefix: String,
        inventoryLimit: Int,
    ): CloudFileReconcileDiagnostics =
        CloudFileReconcileDiagnostics(
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
            repairMode = "dry-run-degraded",
        )

    private fun normalizePrefix(prefix: String): String =
        prefix
            .trim()
            .trim('/')
            .ifBlank { "cloud" }
            .let { "$it/" }

    companion object {
        private const val MAX_INVENTORY_LIMIT = 1_000
    }
}
