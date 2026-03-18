package com.back.boundedContexts.member.subContexts.notification.domain

/**
 * `MemberNotificationType` 열거형입니다.
 * - 역할: 도메인 상태/타입 상수를 안전하게 표현합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
enum class MemberNotificationType {
    COMMENT_REPLY,
    POST_COMMENT,
}
