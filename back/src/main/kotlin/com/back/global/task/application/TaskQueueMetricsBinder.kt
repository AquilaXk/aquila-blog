package com.back.global.task.application

import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.binder.MeterBinder
import org.springframework.stereotype.Component

@Component
class TaskQueueMetricsBinder(
    private val taskQueueDiagnosticsService: TaskQueueDiagnosticsService,
) : MeterBinder {
    override fun bindTo(registry: MeterRegistry) {
        registerGauge(registry, "task.queue.pending") { it.pendingCount.toDouble() }
        registerGauge(registry, "task.queue.ready_pending") { it.readyPendingCount.toDouble() }
        registerGauge(registry, "task.queue.delayed_pending") { it.delayedPendingCount.toDouble() }
        registerGauge(registry, "task.queue.processing") { it.processingCount.toDouble() }
        registerGauge(registry, "task.queue.failed") { it.failedCount.toDouble() }
        registerGauge(registry, "task.queue.stale_processing") { it.staleProcessingCount.toDouble() }
        registerGauge(registry, "task.queue.oldest_ready_pending_age_seconds") {
            (it.oldestReadyPendingAgeSeconds ?: 0L).toDouble()
        }
        registerGauge(registry, "task.queue.oldest_processing_age_seconds") {
            (it.oldestProcessingAgeSeconds ?: 0L).toDouble()
        }
    }

    private fun registerGauge(
        registry: MeterRegistry,
        name: String,
        valueExtractor: (TaskQueueDiagnostics) -> Double,
    ) {
        Gauge
            .builder(name) { valueExtractor(taskQueueDiagnosticsService.diagnoseQueue()) }
            .register(registry)
    }
}
