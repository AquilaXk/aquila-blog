package com.back.global.security.application

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.security.adapter.persistence.AuthSecurityEventRepository
import com.back.global.security.domain.AuthSecurityEventType
import com.back.global.security.model.AuthSecurityEvent
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

data class AuthSecurityEventDto(
    val id: Long,
    val createdAt: Instant,
    val eventType: String,
    val memberId: Long?,
    val loginIdentifier: String?,
    val rememberLoginEnabled: Boolean,
    val ipSecurityEnabled: Boolean,
    val clientIpFingerprint: String?,
    val requestPath: String?,
    val reason: String?,
)

/**
 * 인증 보안 이벤트 저장/조회 유스케이스를 제공합니다.
 */
@Service
class AuthSecurityEventService(
    private val authSecurityEventRepository: AuthSecurityEventRepository,
) {
    /**
     * 로그인 성공 시 적용된 정책값을 운영 관측용 이벤트로 남깁니다.
     * REQUIRES_NEW로 처리해 이후 요청 흐름 실패와 독립적으로 기록을 보장합니다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun recordLoginPolicyApplied(
        member: Member,
        loginIdentifier: String,
        requestPath: String,
    ) {
        authSecurityEventRepository.save(
            AuthSecurityEvent(
                eventType = AuthSecurityEventType.LOGIN_POLICY_APPLIED,
                memberId = member.id,
                loginIdentifier = loginIdentifier,
                rememberLoginEnabled = member.rememberLoginEnabled,
                ipSecurityEnabled = member.ipSecurityEnabled,
                clientIpFingerprint = member.ipSecurityFingerprint,
                requestPath = requestPath.take(255),
                reason = null,
            ),
        )
    }

    /**
     * IP 보안 불일치 차단 시도를 운영 관측용 이벤트로 남깁니다.
     * REQUIRES_NEW로 처리해 차단 예외와 무관하게 기록이 유실되지 않게 합니다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun recordIpSecurityMismatchBlocked(
        memberId: Long?,
        loginIdentifier: String?,
        rememberLoginEnabled: Boolean,
        ipSecurityEnabled: Boolean,
        expectedIpFingerprint: String?,
        requestPath: String,
        reason: String,
    ) {
        authSecurityEventRepository.save(
            AuthSecurityEvent(
                eventType = AuthSecurityEventType.IP_SECURITY_MISMATCH_BLOCKED,
                memberId = memberId,
                loginIdentifier = loginIdentifier,
                rememberLoginEnabled = rememberLoginEnabled,
                ipSecurityEnabled = ipSecurityEnabled,
                clientIpFingerprint = expectedIpFingerprint,
                requestPath = requestPath.take(255),
                reason = reason.take(160),
            ),
        )
    }

    @Transactional(readOnly = true)
    fun getRecent(limit: Int): List<AuthSecurityEventDto> {
        val normalizedLimit = limit.coerceIn(1, 100)
        val pageable =
            PageRequest.of(
                0,
                normalizedLimit,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")),
            )

        return authSecurityEventRepository.findAll(pageable).content.map { it.toDto() }
    }

    private fun AuthSecurityEvent.toDto(): AuthSecurityEventDto =
        AuthSecurityEventDto(
            id = id,
            createdAt = createdAt,
            eventType = eventType.name,
            memberId = memberId,
            loginIdentifier = loginIdentifier,
            rememberLoginEnabled = rememberLoginEnabled,
            ipSecurityEnabled = ipSecurityEnabled,
            clientIpFingerprint = maskFingerprint(clientIpFingerprint),
            requestPath = requestPath,
            reason = reason,
        )

    private fun maskFingerprint(value: String?): String? {
        if (value.isNullOrBlank()) return null
        if (value.length <= 16) return value
        return "${value.take(12)}...${value.takeLast(4)}"
    }
}
