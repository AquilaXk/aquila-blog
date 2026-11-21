package com.back.boundedContexts.post.adapter.persistence

import com.querydsl.jpa.impl.JPAQueryFactory
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock

@DisplayName("PostRepositoryImpl PGroonga 토큰 정규화 단위 테스트")
class PostRepositoryImplSanitizeTest {
    private val repository = PostRepositoryImpl(mock(JPAQueryFactory::class.java))
    private val sanitizeMethod =
        PostRepositoryImpl::class.java.getDeclaredMethod("sanitizePGroongaQueryToken", String::class.java).apply {
            isAccessible = true
        }

    private fun sanitize(raw: String): String? = sanitizeMethod.invoke(repository, raw) as String?

    @Test
    @DisplayName("ASCII 대문자 부울 연산자 예약어와 혼합 검색어를 소문자로 정규화해 Groonga 문법 오류를 막는다")
    fun `normalizes ascii uppercase boolean tokens to lowercase in single pass`() {
        assertThat(sanitize("OR")).isEqualTo("or")
        assertThat(sanitize("AND")).isEqualTo("and")
        assertThat(sanitize("NOT")).isEqualTo("not")
        assertThat(sanitize("Kotlin OR Spring")).isEqualTo("kotlin or spring")
        assertThat(sanitize("한글 OR 테스트")).isEqualTo("한글 or 테스트")
        assertThat(sanitize(" \"((\\\\) ")).isNull()
    }
}
