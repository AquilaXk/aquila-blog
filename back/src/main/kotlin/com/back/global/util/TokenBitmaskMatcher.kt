package com.back.global.util

/**
 * Multi-needle 32-bit bitmask single-pass substring matcher.
 *
 * Reference implementation note: single-pass 32-bit `remainingMask` + 128-entry ASCII
 * case-folding first-character filter inspired by Bitap / shift-or multi-pattern text
 * search algorithms (Apache-2.0 style lookup tables) with early exit on `remainingMask == 0`.
 */
object TokenBitmaskMatcher {
    private const val CHUNK_SIZE = 31

    class MaskChunk internal constructor(
        val tokens: List<String>,
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
            val firstAsciiMask = IntArray(128)
            var nonAsciiFirstMask = 0
            var initialMask = 0
            var emptyTokenCount = 0
            for (bitIndex in 0 until (endIndex - startIndex)) {
                val token = tokens[startIndex + bitIndex]
                if (token.isEmpty()) {
                    emptyTokenCount++
                } else {
                    val bit = 1 shl bitIndex
                    initialMask = initialMask or bit
                    val firstCode = foldChar(token[0]).code
                    if (firstCode < 128) {
                        firstAsciiMask[firstCode] = firstAsciiMask[firstCode] or bit
                    } else {
                        nonAsciiFirstMask = nonAsciiFirstMask or bit
                    }
                }
            }
            MaskChunk(
                tokens = tokens,
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
        val tokens = chunk.tokens
        val startIndex = chunk.startIndex
        val firstAsciiMask = chunk.firstAsciiMask
        val nonAsciiFirstMask = chunk.nonAsciiFirstMask
        var i = 0
        while (i < textLen) {
            val foldedCode = foldChar(text[i]).code
            var candidates = (if (foldedCode < 128) firstAsciiMask[foldedCode] else nonAsciiFirstMask) and remainingMask
            while (candidates != 0) {
                val bitIndex = Integer.numberOfTrailingZeros(candidates)
                candidates = candidates and (candidates - 1)
                val token = tokens[startIndex + bitIndex]
                val tokenLen = token.length
                if (i + tokenLen <= textLen && matchesAtFolded(text, i, token, tokenLen)) {
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
        token: String,
        tokenLen: Int,
    ): Boolean {
        for (j in 0 until tokenLen) {
            val a = text[offset + j]
            val b = token[j]
            if (a != b && foldChar(a) != foldChar(b)) return false
        }
        return true
    }

    private fun foldChar(ch: Char): Char {
        val code = ch.code
        if (code in 'A'.code..'Z'.code) return (code or 0x20).toChar()
        return if (code < 0x80) ch else ch.lowercaseChar()
    }
}
