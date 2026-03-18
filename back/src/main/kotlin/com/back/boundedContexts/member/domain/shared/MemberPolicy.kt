package com.back.boundedContexts.member.domain.shared

import java.util.*

/**
 * `MemberPolicy` 오브젝트입니다.
 * - 역할: 정적 유틸/상수/팩토리 기능을 제공합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
object MemberPolicy {
    val SYSTEM = Member(1, "system", null, "시스템")

    fun genApiKey(): String = UUID.randomUUID().toString()
}
