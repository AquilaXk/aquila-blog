package com.back.boundedContexts.post.dto

/**
 * 마크다운 frontmatter·상단 메타데이터 라인의 ASCII 대소문자 무관 키 판별 및 토큰 정리 헬퍼.
 *
 * 정규식 백트래킹·`CharSequence.subSequence`·`trim().lowercase()` 힙 할당을 없애고
 * ASCII 소문자 비트마스크(`code or 0x20`, `'_'`는 정확 비교)와 단일 패스 인덱스 스캔으로 처리한다.
 */
internal object PostHeaderMetadataMatcher {
    const val KIND_NONE = 0
    const val KIND_TAG = 1
    const val KIND_CATEGORY = 2
    const val KIND_SUMMARY = 3
    const val KIND_THUMBNAIL = 4

    fun matchLine(
        text: CharSequence,
        lineStart: Int,
        lineEnd: Int,
        colonIndex: Int,
        includeSummaryAliases: Boolean = false,
    ): Int {
        if (!hasNonWhitespace(text, colonIndex + 1, lineEnd)) return KIND_NONE
        return matchKeyKind(text, lineStart, colonIndex, includeSummaryAliases)
    }

    fun matchKeyKind(
        text: CharSequence,
        rawStart: Int,
        rawEnd: Int,
        includeSummaryAliases: Boolean = false,
    ): Int {
        var start = rawStart
        var end = rawEnd
        while (start < end && text[start].isWhitespace()) start++
        while (end > start && text[end - 1].isWhitespace()) end--
        return when (end - start) {
            3 -> if (equalsAsciiLower(text, start, "tag")) KIND_TAG else KIND_NONE
            4 -> if (equalsAsciiLower(text, start, "tags")) KIND_TAG else KIND_NONE
            5 ->
                when {
                    equalsAsciiLower(text, start, "thumb") -> KIND_THUMBNAIL
                    equalsAsciiLower(text, start, "cover") -> KIND_THUMBNAIL
                    else -> KIND_NONE
                }
            7 ->
                when {
                    equalsAsciiLower(text, start, "summary") -> KIND_SUMMARY
                    includeSummaryAliases && equalsAsciiLower(text, start, "excerpt") -> KIND_SUMMARY
                    else -> KIND_NONE
                }
            8 -> if (equalsAsciiLower(text, start, "category")) KIND_CATEGORY else KIND_NONE
            9 -> if (equalsAsciiLower(text, start, "thumbnail")) KIND_THUMBNAIL else KIND_NONE
            10 ->
                when {
                    equalsAsciiLower(text, start, "categories") -> KIND_CATEGORY
                    equalsAsciiLower(text, start, "coverimage") -> KIND_THUMBNAIL
                    else -> KIND_NONE
                }
            11 ->
                when {
                    equalsAsciiLower(text, start, "cover_image") -> KIND_THUMBNAIL
                    includeSummaryAliases && equalsAsciiLower(text, start, "description") -> KIND_SUMMARY
                    else -> KIND_NONE
                }
            else -> KIND_NONE
        }
    }

    fun unquoteTrimmed(
        text: String,
        rawStart: Int,
        rawEnd: Int,
    ): String? {
        var start = rawStart
        var end = rawEnd
        while (start < end && text[start].isWhitespace()) start++
        while (end > start && text[end - 1].isWhitespace()) end--
        if (end - start >= 2 && text[start] == '"' && text[end - 1] == '"') {
            start++
            end--
        }
        if (end - start >= 2 && text[start] == '\'' && text[end - 1] == '\'') {
            start++
            end--
        }
        while (start < end && text[start].isWhitespace()) start++
        while (end > start && text[end - 1].isWhitespace()) end--
        return if (start >= end) null else text.substring(start, end)
    }

    private fun hasNonWhitespace(
        text: CharSequence,
        start: Int,
        end: Int,
    ): Boolean {
        for (index in start until end) {
            if (!text[index].isWhitespace()) return true
        }
        return false
    }

    private fun equalsAsciiLower(
        text: CharSequence,
        offset: Int,
        expectedLower: String,
    ): Boolean {
        for (i in 0 until expectedLower.length) {
            val expected = expectedLower[i]
            val actual = text[offset + i]
            if (expected == '_') {
                if (actual != '_') return false
            } else if ((actual.code or 0x20) != expected.code) {
                return false
            }
        }
        return true
    }
}
