package com.back.boundedContexts.member.subContexts.notification.application.service

import org.springframework.stereotype.Component
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

@Component
class MemberNotificationSseEmitterFactory {
    fun create(): SseEmitter = SseEmitter(0L)
}
