package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.boundedContexts.cloud.application.service.CloudVideoUploadSessionService
import com.back.global.storage.metrics.CloudMediaMetrics
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.binder.MeterBinder
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.atomic.AtomicLong

@Component
class CloudUploadSessionMetricsBinder(
    private val cloudVideoUploadSessionService: CloudVideoUploadSessionService,
    @Value("\${custom.runtime.worker-enabled:true}")
    private val workerEnabled: Boolean,
    @Value("\${custom.storage.cloudUploadSessionMetricsRefreshEnabled:true}")
    private val refreshEnabled: Boolean,
) : MeterBinder {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val stuckSessions = AtomicLong(0)

    override fun bindTo(registry: MeterRegistry) {
        Gauge
            .builder(CloudMediaMetrics.UPLOAD_SESSION_STUCK) { stuckSessions.get().toDouble() }
            .register(registry)
    }

    @Scheduled(
        initialDelayString = "\${custom.storage.cloudUploadSessionMetricsInitialDelayMs:60000}",
        fixedDelayString = "\${custom.storage.cloudUploadSessionMetricsRefreshFixedDelayMs:60000}",
    )
    fun refreshSnapshot() {
        if (!refreshEnabled || !workerEnabled) {
            return
        }

        runCatching { cloudVideoUploadSessionService.countStaleIntermediateSessions() }
            .onSuccess { stuckSessions.set(it) }
            .onFailure { exception ->
                logger.warn("Skip cloud upload session stuck metrics refresh", exception)
            }
    }
}
