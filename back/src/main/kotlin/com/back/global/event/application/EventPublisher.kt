package com.back.global.event.application

import com.back.standard.dto.EventPayload
import org.springframework.context.ApplicationEventPublisher
import org.springframework.stereotype.Service

/**
 * EventPublisher는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */

@Service
class EventPublisher(
    private val applicationEventPublisher: ApplicationEventPublisher,
) {
    fun publish(event: EventPayload) {
        applicationEventPublisher.publishEvent(event)
    }
}
