package com.back.global.util

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("TokenBitmaskMatcher 단위 테스트")
class TokenBitmaskMatcherTest {
    @Test
    @DisplayName("빈 토큰 목록 컴파일 시 빈 배열 반환")
    fun compileEmptyTokens() {
        val chunks = TokenBitmaskMatcher.compile(emptyList())
        assertThat(chunks).isEmpty()
        assertThat(TokenBitmaskMatcher.countMatched("test", chunks)).isEqualTo(0)
        assertThat(TokenBitmaskMatcher.countMatchedAcross(listOf("test"), chunks)).isEqualTo(0)
    }

    @Test
    @DisplayName("빈 텍스트 매칭 시 0 반환")
    fun matchEmptyText() {
        val chunks = TokenBitmaskMatcher.compile(listOf("kotlin", "spring"))
        assertThat(TokenBitmaskMatcher.countMatched("", chunks)).isEqualTo(0)
        assertThat(TokenBitmaskMatcher.countMatchedAcross(emptyList(), chunks)).isEqualTo(0)
    }

    @Test
    @DisplayName("대소문자 무시 매칭 및 빈 토큰 처리")
    fun matchCaseInsensitiveAndEmptyToken() {
        val chunks = TokenBitmaskMatcher.compile(listOf("Kotlin", "", "SPRING", "boot"))
        val matched = TokenBitmaskMatcher.countMatched("Learn kotlin with spring framework", chunks)
        // "Kotlin", "", "SPRING" 3개 매칭 ("boot"는 없음)
        assertThat(matched).isEqualTo(3)
    }

    @Test
    @DisplayName("비ASCII 문자열(한글) 매칭")
    fun matchNonAsciiTokens() {
        val chunks = TokenBitmaskMatcher.compile(listOf("스프링", "코틀린", "JAVA"))
        val matched = TokenBitmaskMatcher.countMatched("코틀린 백엔드와 java 개발", chunks)
        assertThat(matched).isEqualTo(2)
    }

    @Test
    @DisplayName("31개 초과 토큰에 대한 다중 청크 컴파일 및 매칭")
    fun matchMultipleChunks() {
        val tokens = (1..35).map { "item-%02d".format(it) }
        val chunks = TokenBitmaskMatcher.compile(tokens)
        assertThat(chunks.size).isEqualTo(2)

        val text = "here is item-01 and item-32 and item-35"
        val matched = TokenBitmaskMatcher.countMatched(text, chunks)
        assertThat(matched).isEqualTo(3)
    }

    @Test
    @DisplayName("countMatchedAcross 다중 텍스트 순회 및 조기 종료")
    fun matchAcrossTexts() {
        val chunks = TokenBitmaskMatcher.compile(listOf("alpha", "beta", "gamma"))
        val texts = listOf("first alpha here", "second beta here", "third gamma here", "fourth unneeded")
        val matched = TokenBitmaskMatcher.countMatchedAcross(texts, chunks)
        assertThat(matched).isEqualTo(3)
    }

    @Test
    @DisplayName("불일치 텍스트 스캔")
    fun matchMismatchedText() {
        val chunks = TokenBitmaskMatcher.compile(listOf("alpha", "beta"))
        val matched = TokenBitmaskMatcher.countMatched("completely different text", chunks)
        assertThat(matched).isEqualTo(0)
    }

    @Test
    @DisplayName("foldChar 직접 호출 검증")
    fun testFoldChar() {
        assertThat(TokenBitmaskMatcher.foldChar('A')).isEqualTo('a')
        assertThat(TokenBitmaskMatcher.foldChar('Z')).isEqualTo('z')
        assertThat(TokenBitmaskMatcher.foldChar('1')).isEqualTo('1')
        assertThat(TokenBitmaskMatcher.foldChar('가')).isEqualTo('가')
    }
}
