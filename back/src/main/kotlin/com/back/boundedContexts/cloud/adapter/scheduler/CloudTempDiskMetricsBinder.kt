package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.global.storage.metrics.CloudMediaMetrics
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.binder.MeterBinder
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.atomic.AtomicLong

/**
 * java.io.tmpdir(업로드 part 버퍼) 디스크 여유를 custom gauge로 노출한다.
 * node_exporter가 없으므로 backend에서 FileStore를 직접 읽는다.
 */
@Component
class CloudTempDiskMetricsBinder(
    @Value("\${custom.storage.cloudTempDiskMetricsRefreshEnabled:true}")
    private val refreshEnabled: Boolean,
) : MeterBinder {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val availBytes = AtomicLong(0)
    private val totalBytes = AtomicLong(0)

    override fun bindTo(registry: MeterRegistry) {
        Gauge
            .builder(CloudMediaMetrics.DISK_TEMP_AVAIL_BYTES) { availBytes.get().toDouble() }
            .register(registry)
        Gauge
            .builder(CloudMediaMetrics.DISK_TEMP_TOTAL_BYTES) { totalBytes.get().toDouble() }
            .register(registry)
        refreshSnapshot()
    }

    @Scheduled(
        initialDelayString = "\${custom.storage.cloudTempDiskMetricsInitialDelayMs:30000}",
        fixedDelayString = "\${custom.storage.cloudTempDiskMetricsRefreshFixedDelayMs:60000}",
    )
    fun refreshSnapshot() {
        if (!refreshEnabled) {
            return
        }

        runCatching {
            val tempRoot = Path.of(System.getProperty("java.io.tmpdir"))
            val store = Files.getFileStore(tempRoot)
            availBytes.set(store.usableSpace.coerceAtLeast(0))
            totalBytes.set(store.totalSpace.coerceAtLeast(0))
        }.onFailure { exception ->
            logger.warn("Skip cloud temp disk metrics refresh", exception)
        }
    }
}
