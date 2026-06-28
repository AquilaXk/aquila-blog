package com.back.global.storage.application

import io.micrometer.core.instrument.FunctionCounter
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.binder.MeterBinder
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.atomic.AtomicLong

@Component
class UploadedFileReconcileMetricsBinder(
    private val uploadedFileRetentionService: UploadedFileRetentionService,
    @Value("\${custom.runtime.worker-enabled:true}")
    private val workerEnabled: Boolean,
    @Value("\${custom.storage.retention.reconcileMetricsRefreshEnabled:true}")
    private val refreshEnabled: Boolean,
) : MeterBinder {
    private val logger = LoggerFactory.getLogger(UploadedFileReconcileMetricsBinder::class.java)

    private val bucketOnlyObjects = AtomicLong(0)
    private val dbOnlyMissingObjects = AtomicLong(0)
    private val longLivedPendingDelete = AtomicLong(0)
    private val inventoryAvailable = AtomicLong(1)
    private val inventoryTruncated = AtomicLong(0)
    private val dbRowsTruncated = AtomicLong(0)
    private val cleanupRefreshFailures = AtomicLong(0)

    override fun bindTo(registry: MeterRegistry) {
        registerGauge(registry, "storage.uploaded_file.reconcile.bucket_only_objects", bucketOnlyObjects)
        registerGauge(registry, "storage.uploaded_file.reconcile.db_only_missing_objects", dbOnlyMissingObjects)
        registerGauge(registry, "storage.uploaded_file.reconcile.long_lived_pending_delete", longLivedPendingDelete)
        registerGauge(registry, "storage.uploaded_file.reconcile.inventory_available", inventoryAvailable)
        registerGauge(registry, "storage.uploaded_file.reconcile.inventory_truncated", inventoryTruncated)
        registerGauge(registry, "storage.uploaded_file.reconcile.db_rows_truncated", dbRowsTruncated)
        FunctionCounter
            .builder("storage.uploaded_file.cleanup.refresh_failures", cleanupRefreshFailures) { it.get().toDouble() }
            .register(registry)
    }

    @Scheduled(
        initialDelayString = "\${custom.storage.retention.reconcileMetricsInitialDelayMs:60000}",
        fixedDelayString = "\${custom.storage.retention.reconcileMetricsRefreshFixedDelayMs:60000}",
    )
    fun refreshSnapshot() {
        if (!refreshEnabled || !workerEnabled) {
            return
        }

        runCatching { uploadedFileRetentionService.diagnoseCleanup() }
            .onSuccess { diagnostics ->
                val reconcile = diagnostics.reconcile
                bucketOnlyObjects.set(reconcile.bucketOnlyObjectCount.toLong())
                dbOnlyMissingObjects.set(reconcile.dbOnlyMissingObjectCount.toLong())
                longLivedPendingDelete.set(reconcile.longLivedPendingDeleteCount)
                inventoryAvailable.set(if (reconcile.inventoryAvailable) 1 else 0)
                inventoryTruncated.set(if (reconcile.inventoryTruncated) 1 else 0)
                dbRowsTruncated.set(if (reconcile.dbRowsTruncated) 1 else 0)
            }.onFailure { exception ->
                cleanupRefreshFailures.incrementAndGet()
                logger.warn("Skip uploaded file reconcile metrics refresh due to diagnostics error", exception)
            }
    }

    private fun registerGauge(
        registry: MeterRegistry,
        name: String,
        holder: AtomicLong,
    ) {
        Gauge
            .builder(name) { holder.get().toDouble() }
            .register(registry)
    }
}
