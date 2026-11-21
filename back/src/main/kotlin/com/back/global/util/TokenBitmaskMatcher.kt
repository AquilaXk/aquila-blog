package com.back.global.util

/**
 * Multi-needle 32-bit bitmask single-pass substring matcher.
 *
 * 참조 구현: apache/answer (Apache-2.0) & Bitap shift-or multi-pattern text search.
 * 128엔트리 정적 ASCII_FOLD_TABLE과 컴파일 시점 사전 폴딩된 foldedTokens: Array<CharArray>를 통해
 * matchesAtFolded 내부 루프에서 토큰 문자 재변환 및 객체 할당을 완전히 제거한다.
 */
object TokenBitmaskMatcher {
    private const val CHUNK_SIZE = 31

    private val ASCII_FOLD_TABLE =
        CharArray(128) { i ->
            if (i in 'A'.code..'Z'.code) (i or 0x20).toChar() else i.toChar()
        }

    @JvmStatic
    internal fun foldChar(ch: Char): Char {
        val code = ch.code
        return if (code < 128) ASCII_FOLD_TABLE[code] else ch.lowercaseChar()
    }

    class MaskChunk internal constructor(
        val tokens: List<String>,
        val foldedTokens: Array<CharArray>,
        val startIndex: Int,
        val initialMask: Int,
        val firstAsciiMask: IntArray,
        val nonAsciiFirstMask: Int,
        val emptyTokenCount: Int,
    )

    fun compile(tokens: List<String>): Array<MaskChunk> {
        if (tokens.isEmpty()) return emptyArray()
        val chunkCount = (tokens.size + CHUNK_SIZE - 1) / CHUNK_SIZE
        return Array(chunkCount) { chunkIndex ->
            val startIndex = chunkIndex * CHUNK_SIZE
            val endIndex = minOf(startIndex + CHUNK_SIZE, tokens.size)
            val chunkLen = endIndex - startIndex
            val foldedTokens =
                Array(chunkLen) { bitIndex ->
                    val token = tokens[startIndex + bitIndex]
                    CharArray(token.length) { j -> foldChar(token[j]) }
                }
            val firstAsciiMask = IntArray(128)
            var nonAsciiFirstMask = 0
            var initialMask = 0
            var emptyTokenCount = 0
            for (bitIndex in 0 until chunkLen) {
                val token = tokens[startIndex + bitIndex]
                if (token.isEmpty()) {
                    emptyTokenCount++
                } else {
                    val bit = 1 shl bitIndex
                    initialMask = initialMask or bit
                    val firstCode = foldedTokens[bitIndex][0].code
                    if (firstCode < 128) {
                        firstAsciiMask[firstCode] = firstAsciiMask[firstCode] or bit
                    } else {
                        nonAsciiFirstMask = nonAsciiFirstMask or bit
                    }
                }
            }
            MaskChunk(
                tokens = tokens,
                foldedTokens = foldedTokens,
                startIndex = startIndex,
                initialMask = initialMask,
                firstAsciiMask = firstAsciiMask,
                nonAsciiFirstMask = nonAsciiFirstMask,
                emptyTokenCount = emptyTokenCount,
            )
        }
    }

    fun countMatched(
        text: CharSequence,
        chunks: Array<MaskChunk>,
    ): Int {
        if (text.isEmpty() || chunks.isEmpty()) return 0
        var matched = 0
        for (chunk in chunks) {
            val remainingMask = scanTextAgainstChunk(text, chunk, chunk.initialMask)
            matched += Integer.bitCount(chunk.initialMask and remainingMask.inv()) + chunk.emptyTokenCount
        }
        return matched
    }

    fun countMatchedAcross(
        texts: List<String>,
        chunks: Array<MaskChunk>,
    ): Int {
        if (texts.isEmpty() || chunks.isEmpty()) return 0
        var matched = 0
        for (chunk in chunks) {
            var remainingMask = chunk.initialMask
            for (text in texts) {
                if (remainingMask == 0) break
                remainingMask = scanTextAgainstChunk(text, chunk, remainingMask)
            }
            matched += Integer.bitCount(chunk.initialMask and remainingMask.inv()) + chunk.emptyTokenCount
        }
        return matched
    }

    private fun scanTextAgainstChunk(
        text: CharSequence,
        chunk: MaskChunk,
        startMask: Int,
    ): Int {
        var remainingMask = startMask
        if (remainingMask == 0) return 0
        val textLen = text.length
        val foldedTokens = chunk.foldedTokens
        val firstAsciiMask = chunk.firstAsciiMask
        val nonAsciiFirstMask = chunk.nonAsciiFirstMask
        var i = 0
        while (i < textLen) {
            val foldedCode = foldChar(text[i]).code
            var candidates = (if (foldedCode < 128) firstAsciiMask[foldedCode] else nonAsciiFirstMask) and remainingMask
            while (candidates != 0) {
                val bitIndex = Integer.numberOfTrailingZeros(candidates)
                candidates = candidates and (candidates - 1)
                val foldedToken = foldedTokens[bitIndex]
                val tokenLen = foldedToken.size
                if (i + tokenLen <= textLen && matchesAtFolded(text, i, foldedToken, tokenLen)) {
                    remainingMask = remainingMask and (1 shl bitIndex).inv()
                    if (remainingMask == 0) return 0
                }
            }
            i++
        }
        return remainingMask
    }

    private fun matchesAtFolded(
        text: CharSequence,
        offset: Int,
        foldedToken: CharArray,
        tokenLen: Int,
    ): Boolean {
        for (j in 0 until tokenLen) {
            val a = text[offset + j]
            val expected = foldedToken[j]
            if (a != expected && foldChar(a) != expected) return false
        }
        return true
    }
}
