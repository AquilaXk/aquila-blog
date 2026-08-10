package com.back.boundedContexts.member.subContexts.notification.application.service

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.back.boundedContexts.member.subContexts.notification.application.port.output.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotificationType
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.catchThrowable
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.slf4j.LoggerFactory
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.io.IOException
import java.time.Instant

@DisplayName("MemberNotificationSseService fail-closed 계약")
class MemberNotificationSseServiceTest {
    private val repository = mock(MemberNotificationRepositoryPort::class.java)
    private val services = mutableListOf<MemberNotificationSseService>()
    private val service = newService()

    private fun newService(
        emitterFactory: MemberNotificationSseEmitterFactory = MemberNotificationSseEmitterFactory(),
        maxEmittersPerMember: Int = 3,
        maxGlobalEmitters: Int = 2_000,
    ): MemberNotificationSseService =
        MemberNotificationSseService(
            memberNotificationRepository = repository,
            emitterFactory = emitterFactory,
            maxEmittersPerMember = maxEmittersPerMember,
            maxGlobalEmitters = maxGlobalEmitters,
            heartbeatSeconds = 3_600,
            replayProbeSeconds = 3_600,
            replayBatchSize = 50,
        ).also(services::add)

    @AfterEach
    fun tearDown() {
        services.forEach(MemberNotificationSseService::shutdownHeartbeatScheduler)
    }

    @Test
    @DisplayName("live send 실패 cleanup 뒤 cursor state를 다시 만들지 않는다")
    fun `send failure does not resurrect cursor state`() {
        given(repository.findByReceiverIdAndIdGreaterThan(7, 0, 50)).willReturn(emptyList())
        val emitter = service.subscribe(memberId = 7, lastEventIdRaw = null)
        emitter.complete()

        service.publish(memberId = 7, notification = notificationDto(id = 17), unreadCount = 1)

        assertThat(cursorState()).isEmpty()
        assertThat(service.diagnostics().globalEmitterCount).isZero()
        assertThat(service.diagnostics().sendFailureCount).isEqualTo(1)
        assertThat(service.diagnostics().sendFailureRemovedEmitterCount).isEqualTo(1)
        assertThat(service.diagnostics().emitterStateMismatchCount).isZero()
    }

    @Test
    @DisplayName("unavailable event 전송 실패는 cursor를 전진하거나 emitter state를 등록하지 않는다")
    fun `failed unavailable event does not advance cursor`() {
        val poisonNotification = mock(MemberNotification::class.java)
        given(poisonNotification.id).willReturn(41)
        given(poisonNotification.type).willThrow(IllegalStateException("dto conversion failed"))
        given(repository.findByReceiverIdAndIdGreaterThan(7, 0, 50)).willReturn(listOf(poisonNotification))
        given(repository.countUnreadByReceiverId(7)).willReturn(4)
        val failingEmitter = FailingEventEmitter("notification-unavailable")
        val emitterFactory = mock(MemberNotificationSseEmitterFactory::class.java)
        given(emitterFactory.create()).willReturn(failingEmitter)
        val failingService = newService(emitterFactory)

        val thrown = catchThrowable { failingService.subscribe(memberId = 7, lastEventIdRaw = null) }

        assertThat(thrown).isInstanceOf(AppException::class.java)
        assertThat((thrown as AppException).errorCode).isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)
        assertThat(cursorState(failingService)).isEmpty()
        assertThat(failingService.diagnostics().globalEmitterCount).isZero()
        assertThat(failingService.diagnostics().sendFailureCount).isEqualTo(1)
    }

    @Test
    @DisplayName("DTO poison row는 같은 ID의 safe unavailable event로만 진행한다")
    fun `poison row emits same id unavailable event`() {
        val poisonNotification = mock(MemberNotification::class.java)
        given(poisonNotification.id).willReturn(41)
        given(poisonNotification.type).willThrow(IllegalStateException("dto conversion failed"))
        given(repository.findByReceiverIdAndIdGreaterThan(7, 0, 50)).willReturn(listOf(poisonNotification))
        given(repository.countUnreadByReceiverId(7)).willReturn(4)
        val capturingEmitter = CapturingEventEmitter()
        val emitterFactory = mock(MemberNotificationSseEmitterFactory::class.java)
        given(emitterFactory.create()).willReturn(capturingEmitter)
        val capturingService = newService(emitterFactory)

        val emitter = capturingService.subscribe(memberId = 7, lastEventIdRaw = null)
        val eventWireText = capturingEmitter.sentWireText.toString()
        val safePayload =
            capturingEmitter.sentData
                .filterIsInstance<Map<*, *>>()
                .single { it["status"] == "UNAVAILABLE" }

        assertThat(eventWireText).contains("id:notification-41\n")
        assertThat(eventWireText).contains("event:notification-unavailable\n")
        assertThat(safePayload)
            .isEqualTo(
                mapOf<String, Any>(
                    "notificationId" to 41L,
                    "status" to "UNAVAILABLE",
                ),
            )
        assertThat(cursorState(capturingService)[emitter]).isEqualTo(41)
        assertThat(capturingService.diagnostics().replayUnavailableNotificationCount).isEqualTo(1)
    }

    @Test
    @DisplayName("initial replay unread 실패는 emitter를 등록하지 않고 typed unavailable로 실패한다")
    fun `initial replay unread failure is unavailable without emitter state`() {
        val notification = mock(MemberNotification::class.java)
        given(notification.id).willReturn(51)
        given(repository.findByReceiverIdAndIdGreaterThan(7, 0, 50)).willReturn(listOf(notification))
        given(repository.countUnreadByReceiverId(7)).willThrow(IllegalStateException("repository unavailable"))

        val thrown = catchThrowable { service.subscribe(memberId = 7, lastEventIdRaw = null) }

        assertThat(thrown).isInstanceOf(AppException::class.java)
        assertThat((thrown as AppException).errorCode).isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)
        assertThat(cursorState()).isEmpty()
        assertThat(service.diagnostics().globalEmitterCount).isZero()
        assertThat(service.diagnostics().unreadUnavailableCount).isEqualTo(1)
        assertThat(service.diagnostics().replayFailureCount).isEqualTo(1)
    }

    @Test
    @DisplayName("live notification cursor는 성공 전송 ID의 최댓값으로만 전진한다")
    fun `live publish advances cursor monotonically`() {
        given(repository.findByReceiverIdAndIdGreaterThan(7, 20, 50)).willReturn(emptyList())
        val emitter = service.subscribe(memberId = 7, lastEventIdRaw = "notification-20")

        service.publish(memberId = 7, notification = notificationDto(id = 18), unreadCount = 2)
        service.publish(memberId = 7, notification = notificationDto(id = 25), unreadCount = 3)
        service.publish(memberId = 7, notification = notificationDto(id = 25), unreadCount = 3)

        assertThat(cursorState()[emitter]).isEqualTo(25)
        assertThat(service.diagnostics().emitterStateMismatchCount).isZero()
    }

    @Test
    @DisplayName("send 성공 직전 completion callback이 실행돼도 cursor state를 되살리지 않는다")
    fun `completion race does not resurrect cursor state`() {
        val callbackEmitter = CallbackDuringEventEmitter("notification")
        val emitterFactory = mock(MemberNotificationSseEmitterFactory::class.java)
        given(emitterFactory.create()).willReturn(callbackEmitter)
        val racingService = newService(emitterFactory)
        given(repository.findByReceiverIdAndIdGreaterThan(7, 0, 50)).willReturn(emptyList())
        racingService.subscribe(memberId = 7, lastEventIdRaw = null)

        racingService.publish(memberId = 7, notification = notificationDto(id = 61), unreadCount = 1)

        assertThat(cursorState(racingService)).isEmpty()
        assertThat(racingService.diagnostics().globalEmitterCount).isZero()
        assertThat(racingService.diagnostics().emitterStateMismatchCount).isZero()
        assertThat(racingService.diagnostics().disconnectCount).isEqualTo(1)
    }

    @Test
    @DisplayName("열린 stream replay repository 실패는 cursor를 유지하지 않고 emitter를 종료한다")
    fun `open replay repository failure removes and terminates emitter`() {
        val lifecycleEmitter = ErrorCapturingEmitter()
        val emitterFactory = mock(MemberNotificationSseEmitterFactory::class.java)
        given(emitterFactory.create()).willReturn(lifecycleEmitter)
        val replayService = newService(emitterFactory)
        given(repository.findByReceiverIdAndIdGreaterThan(7, 0, 50)).willReturn(emptyList())
        replayService.subscribe(memberId = 7, lastEventIdRaw = null)
        given(repository.findByReceiverIdAndIdGreaterThan(7, 0, 50))
            .willThrow(IllegalStateException("repository unavailable"))

        replayService.replayOpenEmitter(memberId = 7, emitter = lifecycleEmitter)

        assertThat(cursorState(replayService)).isEmpty()
        assertThat(replayService.diagnostics().globalEmitterCount).isZero()
        assertThat(replayService.diagnostics().replayFailureCount).isEqualTo(1)
        assertThat(lifecycleEmitter.completionError).isInstanceOf(AppException::class.java)
    }

    @Test
    @DisplayName("member emitter 한도 eviction은 새 연결을 유지한다")
    fun `member emitter eviction preserves newest subscription`() {
        val createdEmitters = mutableListOf<SseEmitter>()
        val emitterFactory = mock(MemberNotificationSseEmitterFactory::class.java)
        given(emitterFactory.create()).willAnswer {
            SseEmitter(0L).also(createdEmitters::add)
        }
        val limitedService =
            newService(
                emitterFactory = emitterFactory,
                maxEmittersPerMember = 2,
            )
        given(repository.findByReceiverIdAndIdGreaterThan(7, 0, 50)).willReturn(emptyList())

        limitedService.subscribe(memberId = 7, lastEventIdRaw = null)
        limitedService.subscribe(memberId = 7, lastEventIdRaw = null)
        val newest = limitedService.subscribe(memberId = 7, lastEventIdRaw = null)

        assertThat(createdEmitters).hasSize(3)
        assertThat(cursorState(limitedService)).hasSize(2).containsKey(newest)
        assertThat(limitedService.diagnostics().globalEmitterCount).isEqualTo(2)
        assertThat(limitedService.diagnostics().emitterStateMismatchCount).isZero()
    }

    @Test
    @DisplayName("global emitter 한도 eviction은 새 연결을 유지한다")
    fun `global emitter eviction preserves newest subscription`() {
        val limitedService = newService(maxGlobalEmitters = 2)
        given(repository.findByReceiverIdAndIdGreaterThan(1, 0, 50)).willReturn(emptyList())
        given(repository.findByReceiverIdAndIdGreaterThan(2, 0, 50)).willReturn(emptyList())
        given(repository.findByReceiverIdAndIdGreaterThan(3, 0, 50)).willReturn(emptyList())

        limitedService.subscribe(memberId = 1, lastEventIdRaw = null)
        limitedService.subscribe(memberId = 2, lastEventIdRaw = null)
        val newest = limitedService.subscribe(memberId = 3, lastEventIdRaw = null)

        assertThat(cursorState(limitedService)).hasSize(2).containsKey(newest)
        assertThat(limitedService.diagnostics().globalEmitterCount).isEqualTo(2)
        assertThat(limitedService.diagnostics().emitterStateMismatchCount).isZero()
    }

    @Test
    @DisplayName("malformed Last-Event-ID는 replay 0으로 폴백하지 않고 BAD_REQUEST로 실패한다")
    fun `malformed cursor is bad request`() {
        val thrown = catchThrowable { service.subscribe(memberId = 7, lastEventIdRaw = "heartbeat-123") }

        assertThat(thrown).isInstanceOf(AppException::class.java)
        assertThat((thrown as AppException).errorCode).isEqualTo(ErrorCode.BAD_REQUEST)
        assertThat(cursorState()).isEmpty()
        verifyNoInteractions(repository)
    }

    @Test
    @DisplayName("poison row 진단 log는 raw exception message를 노출하지 않는다")
    fun `poison diagnostics redact exception message`() {
        val poisonNotification = mock(MemberNotification::class.java)
        given(poisonNotification.id).willReturn(71)
        given(poisonNotification.type).willThrow(IllegalStateException("private-comment-body"))
        given(repository.findByReceiverIdAndIdGreaterThan(7, 0, 50)).willReturn(listOf(poisonNotification))
        given(repository.countUnreadByReceiverId(7)).willReturn(1)
        val logger = LoggerFactory.getLogger(MemberNotificationSseService::class.java) as Logger
        val appender = ListAppender<ILoggingEvent>().also(ListAppender<ILoggingEvent>::start)
        logger.addAppender(appender)

        try {
            service.subscribe(memberId = 7, lastEventIdRaw = null)

            val messages = appender.list.map(ILoggingEvent::getFormattedMessage)
            assertThat(messages).anyMatch { it.contains("reasonType=IllegalStateException") }
            assertThat(messages).noneMatch { it.contains("private-comment-body") }
        } finally {
            logger.detachAppender(appender)
            appender.stop()
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun cursorState(targetService: MemberNotificationSseService = service): Map<SseEmitter, Long> {
        val field = MemberNotificationSseService::class.java.getDeclaredField("emitterLastNotificationId")
        field.isAccessible = true
        return field.get(targetService) as Map<SseEmitter, Long>
    }

    private fun notificationDto(id: Long): MemberNotificationDto =
        MemberNotificationDto(
            id = id,
            type = MemberNotificationType.POST_COMMENT,
            createdAt = Instant.parse("2026-08-10T00:00:00Z"),
            actorId = 3,
            actorName = "작성자",
            actorProfileImageDirectUrl = "/profile/direct",
            actorProfileImageUrl = "/profile/redirect",
            postId = 101,
            commentId = 201,
            postTitle = "글 제목",
            commentPreview = "댓글 내용",
            message = "새 댓글이 있습니다.",
            isRead = false,
        )

    private class FailingEventEmitter(
        private val failedEventName: String,
    ) : SseEmitter(0L) {
        override fun send(builder: SseEventBuilder) {
            val wireText = builder.build().mapNotNull { it.data as? String }.joinToString(separator = "")
            if (wireText.contains("event:$failedEventName\n")) {
                throw IOException("simulated transport failure")
            }
        }
    }

    private class CapturingEventEmitter : SseEmitter(0L) {
        val sentWireText = StringBuilder()
        val sentData = mutableListOf<Any>()

        override fun send(builder: SseEventBuilder) {
            builder.build().forEach { item ->
                when (val data = item.data) {
                    is String -> sentWireText.append(data)
                    else -> sentData.add(data)
                }
            }
        }
    }

    private class CallbackDuringEventEmitter(
        private val callbackEventName: String,
    ) : SseEmitter(0L) {
        private var completionCallback: Runnable? = null

        override fun onCompletion(callback: Runnable) {
            completionCallback = callback
        }

        override fun send(builder: SseEventBuilder) {
            val wireText = builder.build().mapNotNull { it.data as? String }.joinToString(separator = "")
            if (wireText.contains("event:$callbackEventName\n")) {
                completionCallback?.run()
            }
        }
    }

    private class ErrorCapturingEmitter : SseEmitter(0L) {
        var completionError: Throwable? = null
            private set

        override fun completeWithError(ex: Throwable) {
            completionError = ex
            super.completeWithError(ex)
        }
    }
}
