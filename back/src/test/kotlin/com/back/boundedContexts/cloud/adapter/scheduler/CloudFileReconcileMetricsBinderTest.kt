package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.boundedContexts.cloud.application.service.CloudFileReconcileDiagnostics
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
        given(service.diagnose()).willReturn(
            CloudFileReconcileDiagnostics(
                objectPrefix = "cloud/",
                inventoryLimit = 1_000,
                inventoryObjectCount = 2,
                inventoryAvailable = true,
                inventoryTruncated = false,
                dbRowsTruncated = false,
                bucketOnlyObjectCount = 2,
                sampleBucketOnlyObjectKeys = emptyList(),
                dbOnlyMissingObjectCount = 5,
                sampleDbOnlyObjectKeys = emptyList(),
                repairedBucketOnlyDeletedCount = 0,
                repairedDbOnlySoftDeletedCount = 0,
                blockedBySafetyThreshold = false,
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
}
