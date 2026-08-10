package com.back.boundedContexts.member.subContexts.notification.application.service

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock

@DisplayName("MemberNotificationSseMetricsBinder 계약")
class MemberNotificationSseMetricsBinderTest {
    @Test
    @DisplayName("diagnostics 실패를 stale metric 성공으로 숨기지 않는다")
    fun `diagnostics failure propagates`() {
        val service = mock(MemberNotificationSseService::class.java)
        given(service.diagnostics()).willThrow(IllegalStateException("diagnostics unavailable"))

        assertThatThrownBy { MemberNotificationSseMetricsBinder(service).bindTo(SimpleMeterRegistry()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage("diagnostics unavailable")
    }

    @Test
    @DisplayName("unavailable·failure·removed emitter·state mismatch diagnostics를 bounded metric으로 노출한다")
    fun `binds fail closed diagnostics`() {
        val service = mock(MemberNotificationSseService::class.java)
        given(service.diagnostics())
            .willReturn(
                MemberNotificationSseService.StreamDiagnostics(
                    memberEmitterCount = 1,
                    globalEmitterCount = 2,
                    oldestEmitterAgeSeconds = 3,
                    maxEmittersPerMember = 3,
                    maxGlobalEmitters = 2_000,
                    heartbeatSeconds = 20,
                    replayProbeSeconds = 60,
                    replayBatchSize = 50,
                    connectedCount = 4,
                    reconnectSubscribeCount = 5,
                    disconnectCount = 6,
                    replayBatchCount = 7,
                    replayNotificationCount = 8,
                    replayUnavailableNotificationCount = 9,
                    replayFailureCount = 10,
                    unreadUnavailableCount = 11,
                    heartbeatSentCount = 12,
                    sendFailureCount = 13,
                    sendFailureRemovedEmitterCount = 14,
                    emitterStateMismatchCount = 15,
                ),
            )
        val registry = SimpleMeterRegistry()

        val binder = MemberNotificationSseMetricsBinder(service)
        binder.bindTo(registry)

        assertThat(counter(registry, "member.notification.sse.replay_unavailable_notification")).isEqualTo(9.0)
        assertThat(counter(registry, "member.notification.sse.replay_failure")).isEqualTo(10.0)
        assertThat(counter(registry, "member.notification.sse.unread_unavailable")).isEqualTo(11.0)
        assertThat(counter(registry, "member.notification.sse.send_failure_removed_emitter")).isEqualTo(14.0)
        assertThat(registry.get("member.notification.sse.emitter_state_mismatch").gauge().value()).isEqualTo(15.0)
    }

    private fun counter(
        registry: SimpleMeterRegistry,
        name: String,
    ): Double = registry.get(name).functionCounter().count()
}
