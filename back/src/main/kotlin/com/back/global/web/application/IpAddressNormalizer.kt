package com.back.global.web.application

import java.net.Inet4Address
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
    private const val IPV6_BYTE_LENGTH = 16
    private const val IPV6_PREFIX_HEXTET_COUNT = 4
    private val POSSIBLE_IP_LITERAL_REGEX = Regex("^[0-9A-Fa-f:.%]+$")
    private val IPV4_WITH_PORT_REGEX = Regex("^\\d{1,3}(?:\\.\\d{1,3}){3}:\\d{1,5}$")
    private val BRACKET_IPV6_WITH_PORT_REGEX = Regex("^\\[([0-9A-Fa-f:.%]+)]:(\\d{1,5})$")

    fun normalize(raw: String?): String? {
        if (raw.isNullOrBlank()) return null

        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null

        val candidate = extractHostPart(trimmed) ?: return null
        if (!POSSIBLE_IP_LITERAL_REGEX.matches(candidate)) return null

        return runCatching {
            InetAddress
                .getByName(candidate)
                .hostAddress
        }.getOrNull()
    }

    fun normalizeRateLimitKey(raw: String?): String {
        val normalized = normalize(raw) ?: return UNKNOWN_RATE_LIMIT_KEY
        val address = runCatching { InetAddress.getByName(normalized) }.getOrNull() ?: return UNKNOWN_RATE_LIMIT_KEY
        if (address is Inet4Address) {
            return address.hostAddress
        }
        if (address is Inet6Address) {
            val bytes = address.address
            if (bytes.size == IPV6_BYTE_LENGTH) {
                val hextets =
                    IntArray(IPV6_PREFIX_HEXTET_COUNT) { index ->
                        val high = bytes[index * 2].toInt() and 0xFF
                        val low = bytes[index * 2 + 1].toInt() and 0xFF
                        (high shl 8) or low
                    }
                val nonZeroPrefix = hextets.toList().dropLastWhile { it == 0 }
                return if (nonZeroPrefix.isEmpty()) {
                    "::/64"
                } else {
                    "${nonZeroPrefix.joinToString(":") { it.toString(16) }}::/64"
                }
            }
        }
        return normalized
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
