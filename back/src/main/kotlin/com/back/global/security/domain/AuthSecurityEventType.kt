package com.back.global.security.domain

/**
 * 인증 보안 이벤트 유형을 정의합니다.
 */
enum class AuthSecurityEventType {
    LOGIN_POLICY_APPLIED,
    IP_SECURITY_MISMATCH_BLOCKED,
}
