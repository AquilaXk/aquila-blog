package com.back.global.util

import java.security.MessageDigest
import java.util.HexFormat

/**
 * Low-level streaming UTF-8 and decimal ASCII SHA-256 digest helper backed by 256B scratch buffers
 * (`ThreadLocal` for one-shot [sha256Hex] and per-writer buffer for [WeakEtagDigestWriter]) to
 * eliminate full-document `toByteArray(UTF_8)` and multi-KB ETag string copies without reentrancy hazard.
 */
object Utf8ChunkDigest {
    private const val SCRATCH_BUFFER_SIZE = 256
    private const val MAX_DECIMAL_DIGITS = 20
    private val HEX_FORMAT = HexFormat.of()
    private val SCRATCH_BUFFER = ThreadLocal.withInitial { ByteArray(SCRATCH_BUFFER_SIZE) }
    private val MIN_LONG_ASCII_BYTES = "-9223372036854775808".toByteArray(Charsets.US_ASCII)
    private val TRUE_BYTES = "true".toByteArray(Charsets.US_ASCII)
    private val FALSE_BYTES = "false".toByteArray(Charsets.US_ASCII)
    private val NULL_BYTES = "null".toByteArray(Charsets.US_ASCII)

    class Digest128 internal constructor(
        val highBits: Long,
        val lowBits: Long,
    ) {
        fun stripeIndex(stripeMask: Int): Int = highBits.toInt() and stripeMask

        override fun equals(other: Any?): Boolean = other is Digest128 && highBits == other.highBits && lowBits == other.lowBits

        override fun hashCode(): Int = (highBits xor (highBits ushr 32) xor lowBits xor (lowBits ushr 32)).toInt()
    }

    fun sha256Hex(value: CharSequence): String = HEX_FORMAT.formatHex(sha256Bytes(value))

    fun sha256Digest128(value: CharSequence): Digest128 {
        val bytes = sha256Bytes(value)
        return Digest128(
            highBits = packBigEndianLong(bytes, 0),
            lowBits = packBigEndianLong(bytes, 8),
        )
    }

    private fun sha256Bytes(value: CharSequence): ByteArray {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = SCRATCH_BUFFER.get()
        val finalPos = encodeUtf8Range(digest, value, 0, value.length, buffer, 0)
        if (finalPos > 0) {
            digest.update(buffer, 0, finalPos)
        }
        return digest.digest()
    }

    private fun packBigEndianLong(
        bytes: ByteArray,
        offset: Int,
    ): Long =
        ((bytes[offset].toLong() and 0xFFL) shl 56) or
            ((bytes[offset + 1].toLong() and 0xFFL) shl 48) or
            ((bytes[offset + 2].toLong() and 0xFFL) shl 40) or
            ((bytes[offset + 3].toLong() and 0xFFL) shl 32) or
            ((bytes[offset + 4].toLong() and 0xFFL) shl 24) or
            ((bytes[offset + 5].toLong() and 0xFFL) shl 16) or
            ((bytes[offset + 6].toLong() and 0xFFL) shl 8) or
            (bytes[offset + 7].toLong() and 0xFFL)

    fun newWeakEtagWriter(): WeakEtagDigestWriter = WeakEtagDigestWriter()

    class WeakEtagDigestWriter internal constructor() {
        private val digest = MessageDigest.getInstance("SHA-256")
        private val buffer = ByteArray(SCRATCH_BUFFER_SIZE)
        private var pos = 0

        fun appendAscii(value: String): WeakEtagDigestWriter {
            for (index in 0 until value.length) {
                if (pos >= buffer.size) flush()
                buffer[pos++] = value[index].code.toByte()
            }
            return this
        }

        fun appendChar(ch: Char): WeakEtagDigestWriter {
            if (pos >= buffer.size) flush()
            buffer[pos++] = ch.code.toByte()
            return this
        }

        fun appendInt(value: Int): WeakEtagDigestWriter = appendLong(value.toLong())

        fun appendLong(value: Long): WeakEtagDigestWriter {
            if (value == Long.MIN_VALUE) {
                return appendAsciiBytes(MIN_LONG_ASCII_BYTES)
            }
            var remaining = value
            val negative = remaining < 0
            if (negative) remaining = -remaining

            if (pos + MAX_DECIMAL_DIGITS + 1 > buffer.size) {
                flush()
            }
            if (negative) {
                buffer[pos++] = '-'.code.toByte()
            }
            if (remaining == 0L) {
                buffer[pos++] = '0'.code.toByte()
                return this
            }

            var digitCount = 0
            var temp = remaining
            while (temp > 0L) {
                digitCount++
                temp /= 10L
            }
            var writeIdx = pos + digitCount - 1
            temp = remaining
            while (temp > 0L) {
                buffer[writeIdx--] = ('0'.code + (temp % 10L).toInt()).toByte()
                temp /= 10L
            }
            pos += digitCount
            return this
        }

        fun appendBoolean(value: Boolean): WeakEtagDigestWriter = appendAsciiBytes(if (value) TRUE_BYTES else FALSE_BYTES)

        fun appendNullLiteral(): WeakEtagDigestWriter = appendAsciiBytes(NULL_BYTES)

        fun appendUtf8(value: CharSequence): WeakEtagDigestWriter {
            pos = encodeUtf8Range(digest, value, 0, value.length, buffer, pos)
            return this
        }

        fun appendTrimmedUtf8(value: CharSequence): WeakEtagDigestWriter {
            var start = 0
            var end = value.length
            while (start < end && value[start] <= ' ') start++
            while (end > start && value[end - 1] <= ' ') end--
            pos = encodeUtf8Range(digest, value, start, end, buffer, pos)
            return this
        }

        fun appendLengthPrefixedUtf8(value: CharSequence): WeakEtagDigestWriter {
            appendInt(value.length)
            appendChar(':')
            return appendUtf8(value)
        }

        fun appendNullableLengthPrefixedUtf8(value: CharSequence?): WeakEtagDigestWriter {
            if (value == null) return appendNullLiteral()
            return appendLengthPrefixedUtf8(value)
        }

        fun appendDecimalLengthPrefixedLong(value: Long): WeakEtagDigestWriter {
            if (value == Long.MIN_VALUE) {
                return appendAscii("20:").appendAsciiBytes(MIN_LONG_ASCII_BYTES)
            }
            appendInt(decimalStringLength(value))
            appendChar(':')
            return appendLong(value)
        }

        private fun decimalStringLength(value: Long): Int {
            if (value == 0L) return 1
            var remaining = value
            var len = 0
            if (remaining < 0L) {
                len = 1
                remaining = -remaining
            }
            while (remaining > 0L) {
                len++
                remaining /= 10L
            }
            return len
        }

        fun finishWeakEtag(): String {
            flush()
            val hash = digest.digest()
            return "W/\"${HEX_FORMAT.formatHex(hash, 0, 16)}\""
        }

        private fun appendAsciiBytes(bytes: ByteArray): WeakEtagDigestWriter {
            if (pos + bytes.size > buffer.size) {
                flush()
            }
            System.arraycopy(bytes, 0, buffer, pos, bytes.size)
            pos += bytes.size
            return this
        }

        private fun flush() {
            if (pos > 0) {
                digest.update(buffer, 0, pos)
                pos = 0
            }
        }
    }

    private fun encodeUtf8Range(
        digest: MessageDigest,
        text: CharSequence,
        start: Int,
        end: Int,
        buffer: ByteArray,
        initialPos: Int,
    ): Int {
        var pos = initialPos
        var index = start
        val flushLimit = buffer.size - 4
        while (index < end) {
            if (pos > flushLimit) {
                digest.update(buffer, 0, pos)
                pos = 0
            }
            val code = text[index]
            val cp = code.code
            if (cp < 0x80) {
                buffer[pos++] = cp.toByte()
                index++
            } else if (cp < 0x800) {
                buffer[pos++] = (0xC0 or (cp ushr 6)).toByte()
                buffer[pos++] = (0x80 or (cp and 0x3F)).toByte()
                index++
            } else if (Character.isHighSurrogate(code)) {
                if (index + 1 < end && Character.isLowSurrogate(text[index + 1])) {
                    val fullCp = Character.toCodePoint(code, text[index + 1])
                    buffer[pos++] = (0xF0 or (fullCp ushr 18)).toByte()
                    buffer[pos++] = (0x80 or ((fullCp ushr 12) and 0x3F)).toByte()
                    buffer[pos++] = (0x80 or ((fullCp ushr 6) and 0x3F)).toByte()
                    buffer[pos++] = (0x80 or (fullCp and 0x3F)).toByte()
                    index += 2
                } else {
                    buffer[pos++] = '?'.code.toByte()
                    index++
                }
            } else if (Character.isLowSurrogate(code)) {
                buffer[pos++] = '?'.code.toByte()
                index++
            } else {
                buffer[pos++] = (0xE0 or (cp ushr 12)).toByte()
                buffer[pos++] = (0x80 or ((cp ushr 6) and 0x3F)).toByte()
                buffer[pos++] = (0x80 or (cp and 0x3F)).toByte()
                index++
            }
        }
        return pos
    }
}
