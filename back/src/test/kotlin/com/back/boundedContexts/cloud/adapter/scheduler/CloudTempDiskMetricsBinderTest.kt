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
}
