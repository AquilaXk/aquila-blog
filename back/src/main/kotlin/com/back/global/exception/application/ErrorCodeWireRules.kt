package com.back.global.exception.application

import org.springframework.http.HttpStatus

/**
 * ErrorCode wire 값 검증 규칙.
 * enum 상수로는 실패 분기를 실행할 수 없어 단위 테스트 가능한 함수로 분리한다.
 */
internal object ErrorCodeWireRules {
    fun requireValidWire(
        name: String,
        code: String,
        status: HttpStatus,
    ) {
        val prefix =
            code.substringBefore("-").toIntOrNull()
                ?: error("ErrorCode $name: code '$code' must be '{status}-{n}'")
        require(prefix == status.value()) {
            "ErrorCode $name: code prefix $prefix does not match status ${status.value()}"
        }
    }

    fun requireUniqueWireCodes(codes: Collection<String>) {
        val uniqueCount = codes.toSet().size
        require(uniqueCount == codes.size) {
            val duplicates =
                codes
                    .groupBy { it }
                    .filter { it.value.size > 1 }
                    .keys
            "Duplicate ErrorCode wire values: $duplicates"
        }
    }
}
