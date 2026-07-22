package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.boundedContexts.cloud.application.service.CloudFileReconcileService
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
class CloudFileReconcileMetricsBinder(
    private val cloudFileReconcileService: CloudFileReconcileService,
    @Value("\${custom.runtime.worker-enabled:true}")
    private val workerEnabled: Boolean,
    @Value("\${custom.storage.cloudReconcileMetricsRefreshEnabled:true}")
    private val refreshEnabled: Boolean,
) : MeterBinder {
    private val logger = LoggerFactory.getLogger(javaClass)

    private val bucketOnlyObjects = AtomicLong(0)
    private val dbOnlyMissingObjects = AtomicLong(0)
    private val inventoryAvailable = AtomicLong(if (workerEnabled && refreshEnabled) 1 else 0)
    private val inventoryTruncated = AtomicLong(0)
    private val dbRowsTruncated = AtomicLong(0)
    private val repairedBucketOnlyDeleted = AtomicLong(0)
    private val repairedDbOnlySoftDeleted = AtomicLong(0)
    private val refreshFailures = AtomicLong(0)

    override fun bindTo(registry: MeterRegistry) {
        registerGauge(registry, "storage.cloud_file.reconcile.bucket_only_objects", bucketOnlyObjects)
        registerGauge(registry, "storage.cloud_file.reconcile.db_only_missing_objects", dbOnlyMissingObjects)
        registerGauge(registry, "storage.cloud_file.reconcile.inventory_available", inventoryAvailable)
        registerGauge(registry, "storage.cloud_file.reconcile.inventory_truncated", inventoryTruncated)
        registerGauge(registry, "storage.cloud_file.reconcile.db_rows_truncated", dbRowsTruncated)
        registerGauge(registry, "storage.cloud_file.reconcile.repaired_bucket_only_deleted", repairedBucketOnlyDeleted)
        registerGauge(registry, "storage.cloud_file.reconcile.repaired_db_only_soft_deleted", repairedDbOnlySoftDeleted)
        FunctionCounter
            .builder("storage.cloud_file.reconcile.refresh_failures", refreshFailures) { it.get().toDouble() }
            .register(registry)
    }

    @Scheduled(
        initialDelayString = "\${custom.storage.cloudReconcileMetricsInitialDelayMs:60000}",
        fixedDelayString = "\${custom.storage.cloudReconcileMetricsRefreshFixedDelayMs:60000}",
    )
    fun refreshSnapshot() {
        if (!refreshEnabled || !workerEnabled) {
            return
        }

        runCatching { cloudFileReconcileService.diagnose() }
            .onSuccess { diagnostics ->
                bucketOnlyObjects.set(diagnostics.bucketOnlyObjectCount.toLong())
                dbOnlyMissingObjects.set(diagnostics.dbOnlyMissingObjectCount.toLong())
                inventoryAvailable.set(if (diagnostics.inventoryAvailable) 1 else 0)
                inventoryTruncated.set(if (diagnostics.inventoryTruncated) 1 else 0)
                dbRowsTruncated.set(if (diagnostics.dbRowsTruncated) 1 else 0)
                repairedBucketOnlyDeleted.set(diagnostics.repairedBucketOnlyDeletedCount.toLong())
                repairedDbOnlySoftDeleted.set(diagnostics.repairedDbOnlySoftDeletedCount.toLong())
            }.onFailure { exception ->
                refreshFailures.incrementAndGet()
                logger.warn("Skip cloud_file reconcile metrics refresh due to diagnostics error", exception)
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
