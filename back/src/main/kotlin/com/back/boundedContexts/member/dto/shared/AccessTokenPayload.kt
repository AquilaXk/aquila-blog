package com.back.boundedContexts.member.dto.shared

/**
 * `AccessTokenPayload` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class AccessTokenPayload(
    val id: Long,
    val username: String,
    val name: String,
)
