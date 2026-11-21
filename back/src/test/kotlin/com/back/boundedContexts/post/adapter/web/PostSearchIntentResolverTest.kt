package com.back.boundedContexts.post.adapter.web

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("PostSearchIntentResolver 테스트")
class PostSearchIntentResolverTest {
    private val resolver = PostSearchIntentResolver()

    @Test
    @DisplayName("명시 tag 파라미터가 있으면 keyword를 보존하고 tag 파라미터를 우선한다")
    fun resolveExplicitTagParameterFirst() {
        // given
        val keyword = "  spring   boot  "
        val tag = "  Kotlin  "

        // when
        val intent = resolver.resolve(keyword, tag)

        // then
        assertThat(intent).isEqualTo(PostSearchIntent(keyword = "spring boot", tag = "Kotlin"))
    }

    @Test
    @DisplayName("tag 파라미터는 keyword 안의 hashtag 의도보다 우선한다")
    fun resolveExplicitTagBeatsHashtagIntent() {
        // given
        val keyword = "  #SSE  "
        val tag = "  Kotlin  "

        // when
        val intent = resolver.resolve(keyword, tag)

        // then
        assertThat(intent).isEqualTo(PostSearchIntent(keyword = "#SSE", tag = "Kotlin"))
    }

    @Test
    @DisplayName("hashtag 검색어는 태그 필터로 승격하고 남은 텍스트를 keyword로 유지한다")
    fun resolveHashtagIntent() {
        // given
        val keyword = "  reactive   #SSE   stream  "

        // when
        val intent = resolver.resolve(keyword, "")

        // then
        assertThat(intent).isEqualTo(PostSearchIntent(keyword = "reactive stream", tag = "SSE"))
    }

    @Test
    @DisplayName("tag prefix 검색어는 keyword 없이 태그 필터로 해석한다")
    fun resolveEnglishTagPrefixIntent() {
        // given
        val keyword = "tag:Kotlin"

        // when
        val intent = resolver.resolve(keyword, "")

        // then
        assertThat(intent).isEqualTo(PostSearchIntent(keyword = "", tag = "Kotlin"))
    }

    @Test
    @DisplayName("한글 태그 prefix 검색어도 태그 필터로 해석한다")
    fun resolveKoreanTagPrefixIntent() {
        // given
        val keyword = "태그:실시간"

        // when
        val intent = resolver.resolve(keyword, "")

        // then
        assertThat(intent).isEqualTo(PostSearchIntent(keyword = "", tag = "실시간"))
    }

    @Test
    @DisplayName("일반 검색어는 공백만 정규화하고 tag를 비운다")
    fun resolvePlainKeywordIntent() {
        // given
        val keyword = "  spring    websocket  "

        // when
        val intent = resolver.resolve(keyword, "")

        // then
        assertThat(intent).isEqualTo(PostSearchIntent(keyword = "spring websocket", tag = ""))
    }
}
