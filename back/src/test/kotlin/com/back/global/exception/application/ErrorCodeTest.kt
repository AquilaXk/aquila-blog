package com.back.global.exception.application

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("ErrorCode 레지스트리")
class ErrorCodeTest {
    @Test
    @DisplayName("모든 code prefix는 HttpStatus value와 일치한다")
    fun `all code prefixes match http status values`() {
        ErrorCode.entries.forEach { errorCode ->
            val prefix = errorCode.code.substringBefore("-").toInt()
            assertThat(prefix)
                .describedAs(errorCode.name)
                .isEqualTo(errorCode.status.value())
        }
    }

    @Test
    @DisplayName("wire code는 중복되지 않는다")
    fun `wire codes are unique`() {
        val codes = ErrorCode.entries.map { it.code }
        assertThat(codes).doesNotHaveDuplicates()
    }

    @Test
    @DisplayName("fromCode는 등록된 code를 반환하고 미등록 code는 실패한다")
    fun `fromCode resolves known codes and rejects unknown`() {
        assertThat(ErrorCode.fromCode("409-4")).isEqualTo(ErrorCode.OAUTH_SIGNUP_POLICY)
        assertThatThrownBy { ErrorCode.fromCode("999-99") }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Unknown ErrorCode")
    }

    @Test
    @DisplayName("충돌 재배정 코드는 의도한 의미를 유지한다")
    fun `collision reassignment codes keep intended meaning`() {
        assertThat(ErrorCode.ACCESS_DENIED.code).isEqualTo("403-1")
        assertThat(ErrorCode.CSRF_PREFLIGHT_REQUIRED.code).isEqualTo("403-3")
        assertThat(ErrorCode.POST_EDIT_DENIED.code).isEqualTo("403-10")
        assertThat(ErrorCode.POST_VIEW_DENIED.code).isEqualTo("403-11")
        assertThat(ErrorCode.CLOUD_PLAYBACK_DENIED.code).isEqualTo("403-30")
        assertThat(ErrorCode.DB_CONFLICT.code).isEqualTo("409-1")
        assertThat(ErrorCode.POST_CONCURRENT_EDIT.code).isEqualTo("409-10")
        assertThat(ErrorCode.MEMBER_DUPLICATE.code).isEqualTo("409-20")
        assertThat(ErrorCode.OAUTH_SIGNUP_POLICY.code).isEqualTo("409-4")
    }
}
