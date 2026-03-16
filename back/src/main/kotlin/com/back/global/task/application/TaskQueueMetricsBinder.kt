package com.back.global.task.application

import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.binder.MeterBinder
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.atomic.AtomicLong

@Component
class TaskQueueMetricsBinder(
    private val taskQueueDiagnosticsService: TaskQueueDiagnosticsService,
) : MeterBinder {
    private val logger = LoggerFactory.getLogger(TaskQueueMetricsBinder::class.java)

    private val pending = AtomicLong(0)
    private val readyPending = AtomicLong(0)
    private val delayedPending = AtomicLong(0)
    private val processing = AtomicLong(0)
    private val failed = AtomicLong(0)
    private val staleProcessing = AtomicLong(0)
    private val oldestReadyPendingAgeSeconds = AtomicLong(0)
    private val oldestProcessingAgeSeconds = AtomicLong(0)

    override fun bindTo(registry: MeterRegistry) {
        registerGauge(registry, "task.queue.pending", pending)
        registerGauge(registry, "task.queue.ready_pending", readyPending)
        registerGauge(registry, "task.queue.delayed_pending", delayedPending)
        registerGauge(registry, "task.queue.processing", processing)
        registerGauge(registry, "task.queue.failed", failed)
        registerGauge(registry, "task.queue.stale_processing", staleProcessing)
        registerGauge(registry, "task.queue.oldest_ready_pending_age_seconds", oldestReadyPendingAgeSeconds)
        registerGauge(registry, "task.queue.oldest_processing_age_seconds", oldestProcessingAgeSeconds)

        refreshSnapshot()
    }

    @Scheduled(fixedDelayString = "\${custom.task.metrics.refreshFixedDelayMs:15000}")
    fun refreshSnapshot() {
        runCatching { taskQueueDiagnosticsService.diagnoseQueue() }
            .onSuccess { diagnostics ->
                pending.set(diagnostics.pendingCount)
                readyPending.set(diagnostics.readyPendingCount)
                delayedPending.set(diagnostics.delayedPendingCount)
                processing.set(diagnostics.processingCount)
                failed.set(diagnostics.failedCount)
                staleProcessing.set(diagnostics.staleProcessingCount)
                oldestReadyPendingAgeSeconds.set(diagnostics.oldestReadyPendingAgeSeconds ?: 0L)
                oldestProcessingAgeSeconds.set(diagnostics.oldestProcessingAgeSeconds ?: 0L)
            }.onFailure { exception ->
                logger.warn("Skip task queue metrics refresh due to diagnostics error", exception)
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
