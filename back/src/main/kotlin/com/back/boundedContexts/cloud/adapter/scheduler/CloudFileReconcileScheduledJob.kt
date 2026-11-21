package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.boundedContexts.cloud.application.service.CloudFileReconcileService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

/**
 * cloud_file 메타 ↔ `cloud/` 스토리지 객체를 주기적으로 대사한다.
 * 기본은 dry-run(감지). repair는 `custom.storage.cloudReconcileRepairEnabled`로 켠다.
 */
@Component
@ConditionalOnProperty(
    prefix = "custom.runtime",
    name = ["worker-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class CloudFileReconcileScheduledJob(
    private val cloudFileReconcileService: CloudFileReconcileService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${custom.storage.cloudReconcileFixedDelayMs:3600000}")
    @SchedulerLock(name = "cloudFileReconcile", lockAtLeastFor = "PT1M")
    fun reconcileCloudFiles() {
        val diagnostics = cloudFileReconcileService.reconcile()
        if (
            diagnostics.bucketOnlyObjectCount > 0 ||
            diagnostics.dbOnlyMissingObjectCount > 0 ||
            diagnostics.repairedBucketOnlyDeletedCount > 0 ||
            diagnostics.repairedDbOnlySoftDeletedCount > 0 ||
            diagnostics.blockedBySafetyThreshold
        ) {
            log.info(
                "Cloud file reconcile finished (mode={}, bucketOnly={}, dbOnly={}, repairedBucket={}, repairedDb={}, blocked={}, truncated={}/{})",
                diagnostics.repairMode,
                diagnostics.bucketOnlyObjectCount,
                diagnostics.dbOnlyMissingObjectCount,
                diagnostics.repairedBucketOnlyDeletedCount,
                diagnostics.repairedDbOnlySoftDeletedCount,
                diagnostics.blockedBySafetyThreshold,
                diagnostics.inventoryTruncated,
                diagnostics.dbRowsTruncated,
            )
        }
    }
}
