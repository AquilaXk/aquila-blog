package com.back.global.storage.application

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.scheduling.annotation.Scheduled
import java.time.Instant

class UploadedFileReconcileMetricsBinderTest {
    @Test
    fun `worker disabled runtime은 reconcile metrics refresh를 실행하지 않는다`() {
        val retentionService = mock(UploadedFileRetentionService::class.java)
        val registry = SimpleMeterRegistry()
        val binder =
            UploadedFileReconcileMetricsBinder(
                uploadedFileRetentionService = retentionService,
                workerEnabled = false,
                refreshEnabled = true,
            )

        binder.bindTo(registry)
        binder.refreshSnapshot()

        assertThat(registry.get("storage.uploaded_file.reconcile.inventory_available").gauge().value()).isEqualTo(0.0)
        verifyNoInteractions(retentionService)
    }

    @Test
    fun `reconcile diagnostics를 metric gauge로 노출한다`() {
        val retentionService = mock(UploadedFileRetentionService::class.java)
        given(retentionService.diagnoseCleanup()).willReturn(
            diagnostics(
                bucketOnlyObjectCount = 2,
                dbOnlyMissingObjectCount = 3,
                longLivedPendingDeleteCount = 4,
                inventoryAvailable = false,
                inventoryTruncated = true,
                dbRowsTruncated = true,
            ),
        )
        val registry = SimpleMeterRegistry()
        val binder =
            UploadedFileReconcileMetricsBinder(
                uploadedFileRetentionService = retentionService,
                workerEnabled = true,
                refreshEnabled = true,
            )

        binder.bindTo(registry)
        binder.refreshSnapshot()

        assertThat(registry.get("storage.uploaded_file.reconcile.bucket_only_objects").gauge().value()).isEqualTo(2.0)
        assertThat(registry.get("storage.uploaded_file.reconcile.db_only_missing_objects").gauge().value()).isEqualTo(3.0)
        assertThat(registry.get("storage.uploaded_file.reconcile.long_lived_pending_delete").gauge().value()).isEqualTo(4.0)
        assertThat(registry.get("storage.uploaded_file.reconcile.inventory_available").gauge().value()).isEqualTo(0.0)
        assertThat(registry.get("storage.uploaded_file.reconcile.inventory_truncated").gauge().value()).isEqualTo(1.0)
        assertThat(registry.get("storage.uploaded_file.reconcile.db_rows_truncated").gauge().value()).isEqualTo(1.0)
        assertThat(registry.get("storage.uploaded_file.cleanup.refresh_failures").functionCounter().count()).isEqualTo(0.0)
        verify(retentionService).diagnoseCleanup()
    }

    @Test
    fun `diagnostics 실패는 cleanup refresh failure metric으로 누적한다`() {
        val retentionService = mock(UploadedFileRetentionService::class.java)
        given(retentionService.diagnoseCleanup()).willThrow(IllegalStateException("storage unavailable"))
        val registry = SimpleMeterRegistry()
        val binder =
            UploadedFileReconcileMetricsBinder(
                uploadedFileRetentionService = retentionService,
                workerEnabled = true,
                refreshEnabled = true,
            )

        binder.bindTo(registry)
        binder.refreshSnapshot()
        binder.refreshSnapshot()

        assertThat(registry.get("storage.uploaded_file.cleanup.refresh_failures").functionCounter().count()).isEqualTo(2.0)
    }

    @Test
    fun `metrics refresh 기본 주기는 운영 inventory 부하를 줄이기 위해 60초다`() {
        val scheduled =
            UploadedFileReconcileMetricsBinder::class
                .members
                .single { it.name == "refreshSnapshot" }
                .annotations
                .filterIsInstance<Scheduled>()
                .single()

        assertThat(scheduled.fixedDelayString)
            .isEqualTo("\${custom.storage.retention.reconcileMetricsRefreshFixedDelayMs:60000}")
        assertThat(scheduled.initialDelayString)
            .isEqualTo("\${custom.storage.retention.reconcileMetricsInitialDelayMs:60000}")
    }

    private fun diagnostics(
        bucketOnlyObjectCount: Int = 0,
        dbOnlyMissingObjectCount: Int = 0,
        longLivedPendingDeleteCount: Long = 0,
        inventoryAvailable: Boolean = true,
        inventoryTruncated: Boolean = false,
        dbRowsTruncated: Boolean = false,
    ): UploadedFileCleanupDiagnostics =
        UploadedFileCleanupDiagnostics(
            tempCount = 0,
            activeCount = 0,
            pendingDeleteCount = 0,
            deletedCount = 0,
            eligibleForPurgeCount = 0,
            cleanupSafetyThreshold = 25,
            blockedBySafetyThreshold = false,
            oldestEligiblePurgeAfter = Instant.EPOCH,
            sampleEligibleObjectKeys = emptyList(),
            reconcile =
                UploadedFileReconcileDiagnostics(
                    objectPrefix = "posts/",
                    inventoryLimit = 1_000,
                    inventoryObjectCount = bucketOnlyObjectCount,
                    inventoryAvailable = inventoryAvailable,
                    inventoryTruncated = inventoryTruncated,
                    dbRowsTruncated = dbRowsTruncated,
                    bucketOnlyObjectCount = bucketOnlyObjectCount,
                    sampleBucketOnlyObjectKeys = emptyList(),
                    dbOnlyMissingObjectCount = dbOnlyMissingObjectCount,
                    sampleDbOnlyObjectKeys = emptyList(),
                    longLivedPendingDeleteCount = longLivedPendingDeleteCount,
                    sampleLongLivedPendingDeleteObjectKeys = emptyList(),
                ),
        )
}
