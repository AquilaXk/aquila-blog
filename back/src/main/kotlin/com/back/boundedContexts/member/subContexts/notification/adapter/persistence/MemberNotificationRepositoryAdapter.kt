package com.back.boundedContexts.member.subContexts.notification.adapter.persistence

import com.back.boundedContexts.member.subContexts.notification.application.port.output.MemberNotificationRepositoryPort
import org.springframework.stereotype.Component
import java.time.Instant

/**
 * MemberNotificationRepositoryAdapter는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
@Component
class MemberNotificationRepositoryAdapter(
    private val memberNotificationRepository: MemberNotificationRepository,
) : MemberNotificationRepositoryPort {
    override fun deleteCreatedBefore(
        cutoff: Instant,
        limit: Int,
    ): Int = memberNotificationRepository.deleteCreatedBefore(cutoff, limit.coerceIn(1, 1_000))
}
