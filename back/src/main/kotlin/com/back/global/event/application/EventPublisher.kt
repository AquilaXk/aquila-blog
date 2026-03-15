package com.back.global.event.application

import com.back.standard.dto.EventPayload
import org.springframework.context.ApplicationEventPublisher
import org.springframework.stereotype.Service

@Service
class EventPublisher(
    private val applicationEventPublisher: ApplicationEventPublisher,
) {
    fun publish(event: EventPayload) {
        applicationEventPublisher.publishEvent(event)
    }
}
