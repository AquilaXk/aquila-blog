package com.back.global.task.application

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.scheduling.annotation.Scheduled

class TaskQueueMetricsBinderTest {
    @Test
    fun `worker disabled runtime은 diagnostics refresh를 실행하지 않는다`() {
        val diagnosticsService = mock(TaskQueueDiagnosticsService::class.java)
        val binder =
            TaskQueueMetricsBinder(
                taskQueueDiagnosticsService = diagnosticsService,
                workerEnabled = false,
                refreshEnabled = true,
            )

        binder.refreshSnapshot()

        verifyNoInteractions(diagnosticsService)
    }

    @Test
    fun `worker runtime은 diagnostics refresh를 실행한다`() {
        val diagnosticsService = mock(TaskQueueDiagnosticsService::class.java)
        given(diagnosticsService.diagnoseQueue()).willReturn(emptyDiagnostics())
        val registry = SimpleMeterRegistry()
        val binder =
            TaskQueueMetricsBinder(
                taskQueueDiagnosticsService = diagnosticsService,
                workerEnabled = true,
                refreshEnabled = true,
            )

        binder.bindTo(registry)

        verify(diagnosticsService).diagnoseQueue()
        assertThat(registry.get("task.queue.diagnostics.available").gauge().value()).isEqualTo(1.0)
    }

    @Test
    fun `diagnostics 실패는 stale gauge를 unavailable로 표시하고 error counter를 증가시킨다`() {
        val diagnosticsService = mock(TaskQueueDiagnosticsService::class.java)
        given(diagnosticsService.diagnoseQueue()).willThrow(IllegalStateException("database unavailable"))
        val registry = SimpleMeterRegistry()
        val binder =
            TaskQueueMetricsBinder(
                taskQueueDiagnosticsService = diagnosticsService,
                workerEnabled = true,
                refreshEnabled = true,
            )

        binder.bindTo(registry)

        assertThat(registry.get("task.queue.diagnostics.available").gauge().value()).isZero()
        assertThat(registry.get("task.queue.diagnostics.errors").counter().count()).isEqualTo(1.0)
    }

    @Test
    fun `metrics refresh 기본 주기는 운영 count 부하를 줄이기 위해 60초다`() {
        val scheduled =
            TaskQueueMetricsBinder::class
                .members
                .single { it.name == "refreshSnapshot" }
                .annotations
                .filterIsInstance<Scheduled>()
                .single()

        assertThat(scheduled.fixedDelayString).isEqualTo("\${custom.task.metrics.refreshFixedDelayMs:60000}")
    }

    private fun emptyDiagnostics(): TaskQueueDiagnostics =
        TaskQueueDiagnostics(
            pendingCount = 0,
            readyPendingCount = 0,
            delayedPendingCount = 0,
            processingCount = 0,
            completedCount = 0,
            failedCount = 0,
            staleProcessingCount = 0,
            oldestReadyPendingAt = null,
            oldestProcessingAt = null,
            oldestReadyPendingAgeSeconds = null,
            oldestProcessingAgeSeconds = null,
            processingTimeoutSeconds = 900,
            taskTypes = emptyList(),
            recentFailures = emptyList(),
            staleProcessingSamples = emptyList(),
        )
}
