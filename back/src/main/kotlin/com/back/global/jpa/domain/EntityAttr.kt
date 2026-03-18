package com.back.global.jpa.domain

/**
 * EntityAttr는 글로벌 모듈 도메인 상태와 규칙을 표현하는 모델입니다.
 * 불변조건을 유지하며 상태 전이를 메서드 단위로 캡슐화합니다.
 */
interface EntityAttr {
    var intValue: Int?
    var strValue: String?

    var value: Any?
        get() = intValue ?: strValue
        set(value) {
            when (value) {
                is Int -> {
                    intValue = value
                }

                is String -> {
                    strValue = value
                }
            }
        }
}
