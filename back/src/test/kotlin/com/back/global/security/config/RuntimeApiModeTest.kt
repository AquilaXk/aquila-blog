package com.back.global.security.config

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource

@DisplayName("RuntimeApiMode 테스트")
class RuntimeApiModeTest {
    @ParameterizedTest
    @CsvSource(
        "all, ALL",
        "read, READ",
        "reader, READ",
        "admin, ADMIN",
        "write, ADMIN",
        "writer, ADMIN",
        "worker, WORKER",
        "none, NONE",
        " ALL , ALL",
    )
    @DisplayName("알려진 apiMode 문자열을 enum으로 변환한다")
    fun `known api modes map to enum`(
        raw: String,
        expected: RuntimeApiMode,
    ) {
        assertThat(RuntimeApiMode.from(raw)).isEqualTo(expected)
    }

    @Test
    @DisplayName("알 수 없는 apiMode는 IllegalStateException으로 boot fail한다")
    fun `unknown api mode fails closed`() {
        assertThatThrownBy { RuntimeApiMode.from("typo") }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Unknown custom.runtime.apiMode='typo'")
    }
}
