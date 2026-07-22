package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.global.storage.metrics.CloudMediaMetrics
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class CloudTempDiskMetricsBinderTest {
    @Test
    fun `temp disk avail and total gauges를 노출한다`() {
        val registry = SimpleMeterRegistry()
        val binder = CloudTempDiskMetricsBinder(refreshEnabled = true)

        binder.bindTo(registry)

        assertThat(registry.get(CloudMediaMetrics.DISK_TEMP_TOTAL_BYTES).gauge().value()).isGreaterThan(0.0)
        assertThat(registry.get(CloudMediaMetrics.DISK_TEMP_AVAIL_BYTES).gauge().value()).isGreaterThanOrEqualTo(0.0)
    }

    @Test
    fun `refresh disabled면 값을 갱신하지 않는다`() {
        val registry = SimpleMeterRegistry()
        val binder = CloudTempDiskMetricsBinder(refreshEnabled = false)

        binder.bindTo(registry)
        binder.refreshSnapshot()

        assertThat(registry.get(CloudMediaMetrics.DISK_TEMP_TOTAL_BYTES).gauge().value()).isEqualTo(0.0)
        assertThat(registry.get(CloudMediaMetrics.DISK_TEMP_AVAIL_BYTES).gauge().value()).isEqualTo(0.0)
    }

    @Test
    fun `tmpdir 조회 실패 시 refresh를 건너뛴다`() {
        val previous = System.getProperty("java.io.tmpdir")
        try {
            System.setProperty("java.io.tmpdir", "/definitely-missing-tmpdir-${System.nanoTime()}")
            val registry = SimpleMeterRegistry()
            val binder = CloudTempDiskMetricsBinder(refreshEnabled = true)

            binder.bindTo(registry)
            binder.refreshSnapshot()

            assertThat(registry.get(CloudMediaMetrics.DISK_TEMP_TOTAL_BYTES).gauge().value()).isEqualTo(0.0)
        } finally {
            if (previous == null) {
                System.clearProperty("java.io.tmpdir")
            } else {
                System.setProperty("java.io.tmpdir", previous)
            }
        }
    }
}
