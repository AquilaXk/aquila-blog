package com.back.boundedContexts.member.subContexts.notification.application.service

import io.micrometer.core.instrument.FunctionCounter
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.binder.MeterBinder
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.atomic.AtomicLong

/**
 * MemberNotificationSseMetricsBinder는 SSE 진단 스냅샷을 Prometheus 지표로 노출합니다.
 * 장기 연결 상태와 reconnect/replay 누적치를 운영 관측 계층에서 직접 사용할 수 있게 유지합니다.
 */
@Component
class MemberNotificationSseMetricsBinder(
    private val memberNotificationSseService: MemberNotificationSseService,
) : MeterBinder {
    private val logger = LoggerFactory.getLogger(MemberNotificationSseMetricsBinder::class.java)

    private val memberEmitterCount = AtomicLong(0)
    private val globalEmitterCount = AtomicLong(0)
    private val oldestEmitterAgeSeconds = AtomicLong(0)
    private val connectedCount = AtomicLong(0)
    private val reconnectSubscribeCount = AtomicLong(0)
    private val disconnectCount = AtomicLong(0)
    private val replayBatchCount = AtomicLong(0)
    private val replayNotificationCount = AtomicLong(0)
    private val heartbeatSentCount = AtomicLong(0)
    private val sendFailureCount = AtomicLong(0)

    override fun bindTo(registry: MeterRegistry) {
        registerGauge(registry, "member.notification.sse.member_emitters", memberEmitterCount)
        registerGauge(registry, "member.notification.sse.global_emitters", globalEmitterCount)
        registerGauge(registry, "member.notification.sse.oldest_emitter_age_seconds", oldestEmitterAgeSeconds)

        registerCounter(registry, "member.notification.sse.connected", connectedCount)
        registerCounter(registry, "member.notification.sse.reconnect_subscribe", reconnectSubscribeCount)
        registerCounter(registry, "member.notification.sse.disconnect", disconnectCount)
        registerCounter(registry, "member.notification.sse.replay_batch", replayBatchCount)
        registerCounter(registry, "member.notification.sse.replay_notification", replayNotificationCount)
        registerCounter(registry, "member.notification.sse.heartbeat_sent", heartbeatSentCount)
        registerCounter(registry, "member.notification.sse.send_failure", sendFailureCount)

        refreshSnapshot()
    }

    @Scheduled(fixedDelayString = "\${custom.member.notification.sse.metrics.refreshFixedDelayMs:15000}")
    fun refreshSnapshot() {
        runCatching { memberNotificationSseService.diagnostics() }
            .onSuccess { diagnostics ->
                memberEmitterCount.set(diagnostics.memberEmitterCount.toLong())
                globalEmitterCount.set(diagnostics.globalEmitterCount.toLong())
                oldestEmitterAgeSeconds.set(diagnostics.oldestEmitterAgeSeconds)
                connectedCount.set(diagnostics.connectedCount)
                reconnectSubscribeCount.set(diagnostics.reconnectSubscribeCount)
                disconnectCount.set(diagnostics.disconnectCount)
                replayBatchCount.set(diagnostics.replayBatchCount)
                replayNotificationCount.set(diagnostics.replayNotificationCount)
                heartbeatSentCount.set(diagnostics.heartbeatSentCount)
                sendFailureCount.set(diagnostics.sendFailureCount)
            }.onFailure { exception ->
                logger.warn("Skip notification sse metrics refresh due to diagnostics error", exception)
            }
    }

    private fun registerGauge(
        registry: MeterRegistry,
        name: String,
        holder: AtomicLong,
    ) {
        Gauge.builder(name) { holder.get().toDouble() }.register(registry)
    }

    private fun registerCounter(
        registry: MeterRegistry,
        name: String,
        holder: AtomicLong,
    ) {
        FunctionCounter.builder(name, holder) { it.get().toDouble() }.register(registry)
    }
}
