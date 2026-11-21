package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.boundedContexts.cloud.application.service.CloudFileReconcileDiagnostics
import com.back.boundedContexts.cloud.application.service.CloudFileReconcileRepairSnapshot
import com.back.boundedContexts.cloud.application.service.CloudFileReconcileService
import com.back.global.storage.metrics.CloudMediaMetrics
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock

class CloudFileReconcileMetricsBinderTest {
    @Test
    fun `reconcile orphan gauges를 kind 라벨로 노출한다`() {
        val service = mock(CloudFileReconcileService::class.java)
        given(service.diagnose()).willReturn(sampleDiagnostics(bucketOnly = 2, dbOnly = 5))
        given(service.lastRepairSnapshot()).willReturn(null)
        val registry = SimpleMeterRegistry()
        val binder =
            CloudFileReconcileMetricsBinder(
                cloudFileReconcileService = service,
                workerEnabled = true,
                refreshEnabled = true,
            )

        binder.bindTo(registry)
        binder.refreshSnapshot()

        assertThat(
            registry
                .get(CloudMediaMetrics.RECONCILE_ORPHANS)
                .tag("kind", "object")
                .gauge()
                .value(),
        ).isEqualTo(2.0)
        assertThat(
            registry
                .get(CloudMediaMetrics.RECONCILE_ORPHANS)
                .tag("kind", "metadata")
                .gauge()
                .value(),
        ).isEqualTo(5.0)
    }

    @Test
    fun `repair gauges는 diagnose 값이 아니라 lastRepairSnapshot을 사용한다`() {
        val service = mock(CloudFileReconcileService::class.java)
        given(service.diagnose()).willReturn(
            sampleDiagnostics(
                bucketOnly = 4,
                dbOnly = 6,
                repairedBucket = 0,
                repairedDb = 0,
            ),
        )
        given(service.lastRepairSnapshot()).willReturn(
            CloudFileReconcileRepairSnapshot(
                repairedBucketOnlyDeletedCount = 3,
                repairedDbOnlySoftDeletedCount = 1,
            ),
        )
        val registry = SimpleMeterRegistry()
        val binder =
            CloudFileReconcileMetricsBinder(
                cloudFileReconcileService = service,
                workerEnabled = true,
                refreshEnabled = true,
            )

        binder.bindTo(registry)
        binder.refreshSnapshot()

        assertThat(
            registry
                .get("storage.cloud_file.reconcile.repaired_bucket_only_deleted")
                .gauge()
                .value(),
        ).isEqualTo(3.0)
        assertThat(
            registry
                .get("storage.cloud_file.reconcile.repaired_db_only_soft_deleted")
                .gauge()
                .value(),
        ).isEqualTo(1.0)
        assertThat(
            registry
                .get("storage.cloud_file.reconcile.bucket_only_objects")
                .gauge()
                .value(),
        ).isEqualTo(4.0)
    }

    @Test
    fun `worker disabled면 refresh를 건너뛴다`() {
        val service = mock(CloudFileReconcileService::class.java)
        val binder =
            CloudFileReconcileMetricsBinder(
                cloudFileReconcileService = service,
                workerEnabled = false,
                refreshEnabled = true,
            )

        binder.refreshSnapshot()

        org.mockito.Mockito.verifyNoInteractions(service)
    }

    @Test
    fun `diagnose 실패 시 refresh failure를 증가시킨다`() {
        val service = mock(CloudFileReconcileService::class.java)
        given(service.diagnose()).willThrow(IllegalStateException("diagnose failed"))
        val registry = SimpleMeterRegistry()
        val binder =
            CloudFileReconcileMetricsBinder(
                cloudFileReconcileService = service,
                workerEnabled = true,
                refreshEnabled = true,
            )

        binder.bindTo(registry)
        binder.refreshSnapshot()

        assertThat(
            registry
                .find("storage.cloud_file.reconcile.refresh_failures")
                .functionCounter()
                ?.count(),
        ).isEqualTo(1.0)
    }

    private fun sampleDiagnostics(
        bucketOnly: Int,
        dbOnly: Int,
        repairedBucket: Int = 0,
        repairedDb: Int = 0,
    ): CloudFileReconcileDiagnostics =
        CloudFileReconcileDiagnostics(
            objectPrefix = "cloud/",
            inventoryLimit = 1_000,
            inventoryObjectCount = bucketOnly,
            inventoryAvailable = true,
            inventoryTruncated = false,
            dbRowsTruncated = false,
            bucketOnlyObjectCount = bucketOnly,
            sampleBucketOnlyObjectKeys = emptyList(),
            dbOnlyMissingObjectCount = dbOnly,
            sampleDbOnlyObjectKeys = emptyList(),
            repairedBucketOnlyDeletedCount = repairedBucket,
            repairedDbOnlySoftDeletedCount = repairedDb,
            blockedBySafetyThreshold = false,
        )
}
