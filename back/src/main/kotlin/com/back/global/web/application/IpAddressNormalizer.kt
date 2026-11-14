package com.back.global.web.application

import java.net.Inet6Address
import java.net.InetAddress

/**
 * 요청 헤더/소켓에서 추출한 IP 표현식을 정규화한다.
 * - 포트가 섞인 IPv4/IPv6를 분리
 * - hostname/임의 문자열은 배제
 * - InetAddress canonical hostAddress 형태로 통일
 */
object IpAddressNormalizer {
    private const val UNKNOWN_RATE_LIMIT_KEY = "unknown"
    private const val IPV6_PREFIX_HEXTET_COUNT = 4
    private val HEX_DIGITS = charArrayOf('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f')
    private val IPV4_LITERAL_CANDIDATE_REGEX = Regex("^[0-9.]+$")
    private val IPV6_LITERAL_CANDIDATE_REGEX = Regex("^[0-9A-Fa-f:.%]*:[0-9A-Fa-f:.%]*$")
    private val IPV4_WITH_PORT_REGEX = Regex("^\\d{1,3}(?:\\.\\d{1,3}){3}:\\d{1,5}$")
    private val BRACKET_IPV6_WITH_PORT_REGEX = Regex("^\\[([0-9A-Fa-f:.%]+)]:(\\d{1,5})$")

    fun normalize(raw: String?): String? = resolveInetAddress(raw)?.hostAddress

    fun normalizeRateLimitKey(raw: String?): String {
        val address = resolveInetAddress(raw) ?: return UNKNOWN_RATE_LIMIT_KEY
        return if (address is Inet6Address) {
            formatIpv6Prefix64(address.address)
        } else {
            address.hostAddress
        }
    }

    private fun resolveInetAddress(raw: String?): InetAddress? {
        if (raw.isNullOrBlank()) return null

        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null

        val candidate = extractHostPart(trimmed) ?: return null
        val isPlausibleIpLiteral =
            if (candidate.contains(':')) {
                IPV6_LITERAL_CANDIDATE_REGEX.matches(candidate)
            } else {
                IPV4_LITERAL_CANDIDATE_REGEX.matches(candidate)
            }
        if (!isPlausibleIpLiteral) return null

        return runCatching { InetAddress.getByName(candidate) }.getOrNull()
    }

    private fun formatIpv6Prefix64(bytes: ByteArray): String {
        var lastNonZero = IPV6_PREFIX_HEXTET_COUNT - 1
        while (lastNonZero >= 0 && readHextet(bytes, lastNonZero) == 0) {
            lastNonZero--
        }
        if (lastNonZero < 0) return "::/64"

        val sb = StringBuilder(24)
        for (index in 0..lastNonZero) {
            if (index > 0) sb.append(':')
            appendHexWord(sb, readHextet(bytes, index))
        }
        sb.append("::/64")
        return sb.toString()
    }

    private fun readHextet(
        bytes: ByteArray,
        wordIndex: Int,
    ): Int {
        val byteOffset = wordIndex shl 1
        return ((bytes[byteOffset].toInt() and 0xFF) shl 8) or (bytes[byteOffset + 1].toInt() and 0xFF)
    }

    private fun appendHexWord(
        sb: StringBuilder,
        word: Int,
    ) {
        if (word == 0) {
            sb.append('0')
            return
        }
        var started = false
        var shift = 12
        while (shift >= 0) {
            val nibble = (word ushr shift) and 0xF
            if (started || nibble != 0) {
                sb.append(HEX_DIGITS[nibble])
                started = true
            }
            shift -= 4
        }
    }

    private fun extractHostPart(raw: String): String? {
        val bracketMatch = BRACKET_IPV6_WITH_PORT_REGEX.matchEntire(raw)
        if (bracketMatch != null) {
            return bracketMatch.groupValues[1].substringBefore('%')
        }

        if (raw.startsWith('[') && raw.endsWith(']')) {
            return raw.removePrefix("[").removeSuffix("]").substringBefore('%')
        }

        if (IPV4_WITH_PORT_REGEX.matches(raw)) {
            return raw.substringBeforeLast(':')
        }

        return raw.substringBefore('%')
    }
}
