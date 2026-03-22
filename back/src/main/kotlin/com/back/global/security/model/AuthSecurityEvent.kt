package com.back.global.security.model

import com.back.global.jpa.model.BaseTime
import com.back.global.security.domain.AuthSecurityEventType
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Index
import jakarta.persistence.Table

/**
 * 인증/세션 보안 관련 주요 이벤트를 운영 관측 목적으로 저장합니다.
 */
@Entity
@Table(
    name = "auth_security_event",
    indexes = [
        Index(name = "idx_auth_security_event_created_at", columnList = "created_at"),
        Index(name = "idx_auth_security_event_event_type_created_at", columnList = "event_type,created_at"),
        Index(name = "idx_auth_security_event_member_created_at", columnList = "member_id,created_at"),
    ],
)
class AuthSecurityEvent(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    override val id: Long = 0,
    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 64)
    var eventType: AuthSecurityEventType,
    @Column(name = "member_id")
    var memberId: Long? = null,
    @Column(name = "login_identifier", length = 320)
    var loginIdentifier: String? = null,
    @Column(name = "remember_login_enabled", nullable = false)
    var rememberLoginEnabled: Boolean = true,
    @Column(name = "ip_security_enabled", nullable = false)
    var ipSecurityEnabled: Boolean = false,
    @Column(name = "client_ip_fingerprint", length = 96)
    var clientIpFingerprint: String? = null,
    @Column(name = "request_path", length = 255)
    var requestPath: String? = null,
    @Column(name = "reason", length = 160)
    var reason: String? = null,
) : BaseTime(id)
