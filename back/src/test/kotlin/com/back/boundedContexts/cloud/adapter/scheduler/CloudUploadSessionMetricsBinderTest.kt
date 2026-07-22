package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.boundedContexts.cloud.application.service.CloudVideoUploadSessionService
import com.back.global.storage.metrics.CloudMediaMetrics
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.scheduling.annotation.Scheduled

class CloudUploadSessionMetricsBinderTest {
    @Test
    fun `worker disabled runtime은 stuck metrics refresh를 실행하지 않는다`() {
        val service = mock(CloudVideoUploadSessionService::class.java)
        val registry = SimpleMeterRegistry()
        val binder =
            CloudUploadSessionMetricsBinder(
                cloudVideoUploadSessionService = service,
                workerEnabled = false,
                refreshEnabled = true,
            )

        binder.bindTo(registry)
        binder.refreshSnapshot()

        assertThat(registry.get(CloudMediaMetrics.UPLOAD_SESSION_STUCK).gauge().value()).isEqualTo(0.0)
        verifyNoInteractions(service)
    }

    @Test
    fun `stale intermediate session 수를 stuck gauge로 노출한다`() {
        val service = mock(CloudVideoUploadSessionService::class.java)
        given(service.countStaleIntermediateSessions()).willReturn(3)
        val registry = SimpleMeterRegistry()
        val binder =
            CloudUploadSessionMetricsBinder(
                cloudVideoUploadSessionService = service,
                workerEnabled = true,
                refreshEnabled = true,
            )

        binder.bindTo(registry)
        binder.refreshSnapshot()

        assertThat(registry.get(CloudMediaMetrics.UPLOAD_SESSION_STUCK).gauge().value()).isEqualTo(3.0)
        verify(service).countStaleIntermediateSessions()
    }

    @Test
    fun `countStale 실패 시 stuck gauge refresh를 건너뛴다`() {
        val service = mock(CloudVideoUploadSessionService::class.java)
        given(service.countStaleIntermediateSessions()).willThrow(IllegalStateException("count failed"))
        val registry = SimpleMeterRegistry()
        val binder =
            CloudUploadSessionMetricsBinder(
                cloudVideoUploadSessionService = service,
                workerEnabled = true,
                refreshEnabled = true,
            )

        binder.bindTo(registry)
        binder.refreshSnapshot()

        assertThat(registry.get(CloudMediaMetrics.UPLOAD_SESSION_STUCK).gauge().value()).isEqualTo(0.0)
    }

    @Test
    fun `metrics refresh 기본 주기는 60초다`() {
        val scheduled =
            CloudUploadSessionMetricsBinder::class
                .members
                .single { it.name == "refreshSnapshot" }
                .annotations
                .filterIsInstance<Scheduled>()
                .single()

        assertThat(scheduled.fixedDelayString)
            .isEqualTo("\${custom.storage.cloudUploadSessionMetricsRefreshFixedDelayMs:60000}")
    }
}
