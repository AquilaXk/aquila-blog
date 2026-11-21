package com.back.boundedContexts.post.dto

/**
 * 참조 구현: FasterXML/jackson-core (Apache-2.0) & commonmark/commonmark-java (BSD-2-Clause)
 * 마크다운 frontmatter·상단 메타데이터 라인의 ASCII 대소문자 무관 키 판별 및 토큰 정리 헬퍼.
 *
 * 정적 128-엔트리 ASCII 비트마스크 테이블을 통한 무할당 단일 패스 스캐너.
 * 정규식 백트래킹·`CharSequence.subSequence`·`trim().lowercase()` 힙 할당을 없애고
 * ASCII 소문자 비트마스크(`code or 0x20`, `'_'`는 정확 비교)와 단일 패스 인덱스 스캔으로 처리한다.
 */
internal object PostHeaderMetadataMatcher {
    const val KIND_NONE = 0
    const val KIND_TAG = 1
    const val KIND_CATEGORY = 2
    const val KIND_SUMMARY = 3
    const val KIND_THUMBNAIL = 4

    private const val FLAG_WS: Byte = 1
    private const val FLAG_QUOTE: Byte = 2
    private const val FLAG_ALPHA: Byte = 4

    private val ASCII_CHAR_FLAGS =
        ByteArray(128).apply {
            this[' '.code] = (this[' '.code].toInt() or FLAG_WS.toInt()).toByte()
            this['\t'.code] = (this['\t'.code].toInt() or FLAG_WS.toInt()).toByte()
            this['\n'.code] = (this['\n'.code].toInt() or FLAG_WS.toInt()).toByte()
            this['\r'.code] = (this['\r'.code].toInt() or FLAG_WS.toInt()).toByte()
            this[11] = (this[11].toInt() or FLAG_WS.toInt()).toByte()
            this[12] = (this[12].toInt() or FLAG_WS.toInt()).toByte()

            this['"'.code] = (this['"'.code].toInt() or FLAG_QUOTE.toInt()).toByte()
            this['\''.code] = (this['\''.code].toInt() or FLAG_QUOTE.toInt()).toByte()

            for (c in 'a'..'z') {
                this[c.code] = (this[c.code].toInt() or FLAG_ALPHA.toInt()).toByte()
            }
            for (c in 'A'..'Z') {
                this[c.code] = (this[c.code].toInt() or FLAG_ALPHA.toInt()).toByte()
            }
        }

    @JvmStatic
    fun isWhitespace(ch: Char): Boolean {
        val code = ch.code
        return if (code < 128) {
            (ASCII_CHAR_FLAGS[code].toInt() and FLAG_WS.toInt()) != 0
        } else {
            ch.isWhitespace()
        }
    }

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
        while (start < end && isWhitespace(text[start])) start++
        while (end > start && isWhitespace(text[end - 1])) end--
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
        while (start < end && isWhitespace(text[start])) start++
        while (end > start && isWhitespace(text[end - 1])) end--
        if (end - start >= 2 && text[start] == '"' && text[end - 1] == '"') {
            start++
            end--
        }
        if (end - start >= 2 && text[start] == '\'' && text[end - 1] == '\'') {
            start++
            end--
        }
        while (start < end && isWhitespace(text[start])) start++
        while (end > start && isWhitespace(text[end - 1])) end--
        return if (start >= end) null else text.substring(start, end)
    }

    private fun hasNonWhitespace(
        text: CharSequence,
        start: Int,
        end: Int,
    ): Boolean {
        for (index in start until end) {
            if (!isWhitespace(text[index])) return true
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
