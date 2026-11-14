package com.back.global.web.application

import java.net.Inet6Address
import java.net.InetAddress

/**
 * 요청 헤더/소켓에서 추출한 IP 표현식을 정규화한다.
 *
 * 참조 구현: RFC 4291 (IP Version 6 Addressing Architecture) & pure byte/hextet parser.
 * 정규식과 DNS 조회가 가능한 InetAddress.getByName을 완전히 제거하고,
 * 순수 바이트/16비트 워드 파서와 InetAddress.getByAddress만 사용하여
 * DNS 룩업 블로킹을 방지하고 무예외 Fail-Closed 정규화를 수행한다.
 */
object IpAddressNormalizer {
    private const val UNKNOWN_RATE_LIMIT_KEY = "unknown"
    private const val IPV6_PREFIX_HEXTET_COUNT = 4
    private val HEX_DIGITS = charArrayOf('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f')

    fun normalize(raw: String?): String? = resolveInetAddress(raw)?.hostAddress

    fun normalizeRateLimitKeyOrNull(raw: String?): String? {
        val address = resolveInetAddress(raw) ?: return null
        return if (address is Inet6Address) {
            formatIpv6Prefix64(address.address)
        } else {
            address.hostAddress
        }
    }

    fun normalizeRateLimitKey(raw: String?): String = normalizeRateLimitKeyOrNull(raw) ?: UNKNOWN_RATE_LIMIT_KEY

    private fun resolveInetAddress(raw: String?): InetAddress? {
        if (raw.isNullOrBlank()) return null
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null

        val host = extractHostPart(trimmed) ?: return null
        if (host.isEmpty()) return null

        val ipv4Bytes = parseIpv4Bytes(host)
        if (ipv4Bytes != null) {
            return runCatching { InetAddress.getByAddress(ipv4Bytes) }.getOrNull()
        }

        val ipv6Bytes = parseIpv6Bytes(host)
        if (ipv6Bytes != null) {
            if (isIpv4Mapped(ipv6Bytes)) {
                val ipv4Part = ByteArray(4) { i -> ipv6Bytes[12 + i] }
                return runCatching { InetAddress.getByAddress(ipv4Part) }.getOrNull()
            }
            return runCatching { InetAddress.getByAddress(ipv6Bytes) }.getOrNull()
        }

        return null
    }

    private fun isIpv4Mapped(bytes: ByteArray): Boolean {
        if (bytes.size != 16) return false
        for (i in 0 until 10) {
            if (bytes[i] != 0.toByte()) return false
        }
        return bytes[10] == 0xFF.toByte() && bytes[11] == 0xFF.toByte()
    }

    private fun extractHostPart(raw: String): String? {
        val len = raw.length
        if (raw[0] == '[') {
            val closeBracket = raw.indexOf(']')
            if (closeBracket <= 1) return null
            val hostWithZone = raw.substring(1, closeBracket)
            if (closeBracket + 1 < len) {
                if (raw[closeBracket + 1] != ':') return null
                val portStr = raw.substring(closeBracket + 2)
                if (!isValidPort(portStr)) return null
            }
            val zoneIdx = hostWithZone.indexOf('%')
            return if (zoneIdx >= 0) hostWithZone.substring(0, zoneIdx) else hostWithZone
        }

        val zoneIdx = raw.indexOf('%')
        val unzoned = if (zoneIdx >= 0) raw.substring(0, zoneIdx) else raw

        var colonCount = 0
        var lastColonIndex = -1
        for (i in 0 until unzoned.length) {
            if (unzoned[i] == ':') {
                colonCount++
                lastColonIndex = i
            }
        }

        if (colonCount == 1) {
            val portCandidate = unzoned.substring(lastColonIndex + 1)
            if (isValidPort(portCandidate)) {
                return unzoned.substring(0, lastColonIndex)
            }
            return null
        }

        return unzoned
    }

    private fun isValidPort(s: String): Boolean {
        if (s.isEmpty() || s.length > 5) return false
        var port = 0
        for (i in 0 until s.length) {
            val c = s[i]
            if (c !in '0'..'9') return false
            port = port * 10 + (c - '0')
        }
        return port in 1..65535
    }

    private fun parseIpv4Bytes(s: String): ByteArray? {
        val len = s.length
        if (len < 7 || len > 15) return null

        val bytes = ByteArray(4)
        var octetIndex = 0
        var currentOctet = 0
        var octetDigits = 0

        for (i in 0 until len) {
            val c = s[i]
            if (c == '.') {
                if (octetDigits == 0 || octetIndex >= 3) return null
                if (octetDigits > 1 && s[i - octetDigits] == '0') return null
                bytes[octetIndex++] = currentOctet.toByte()
                currentOctet = 0
                octetDigits = 0
            } else if (c in '0'..'9') {
                currentOctet = currentOctet * 10 + (c - '0')
                if (currentOctet > 255) return null
                octetDigits++
                if (octetDigits > 3) return null
            } else {
                return null
            }
        }

        if (octetIndex != 3 || octetDigits == 0) return null
        if (octetDigits > 1 && s[len - octetDigits] == '0') return null
        bytes[3] = currentOctet.toByte()

        return bytes
    }

    private fun parseIpv6Bytes(s: String): ByteArray? {
        val len = s.length
        if (len < 2 || len > 45 || !s.contains(':') || s.contains(":::")) return null

        val lastColon = s.lastIndexOf(':')
        val hasEmbeddedIpv4 = lastColon >= 0 && s.indexOf('.', lastColon) >= 0

        val ipv6Part =
            if (hasEmbeddedIpv4) {
                if (lastColon > 0 && s[lastColon - 1] == ':') {
                    s.substring(0, lastColon + 1)
                } else {
                    s.substring(0, lastColon)
                }
            } else {
                s
            }
        val ipv4Part = if (hasEmbeddedIpv4) s.substring(lastColon + 1) else null

        val doubleColonIndex = ipv6Part.indexOf("::")
        if (doubleColonIndex >= 0 && ipv6Part.indexOf("::", doubleColonIndex + 2) >= 0) {
            return null
        }

        val ipv4Bytes = if (ipv4Part != null) parseIpv4Bytes(ipv4Part) ?: return null else null

        val hextets = IntArray(8)
        val targetHextetCount = if (hasEmbeddedIpv4) 6 else 8

        if (doubleColonIndex < 0) {
            val parts = splitColons(ipv6Part)
            if (parts.size != targetHextetCount) return null
            for (i in 0 until targetHextetCount) {
                val hex = parseHexWord(parts[i]) ?: return null
                hextets[i] = hex
            }
        } else {
            val leftStr = ipv6Part.substring(0, doubleColonIndex)
            val rightStr = ipv6Part.substring(doubleColonIndex + 2)
            val leftParts = if (leftStr.isEmpty()) emptyList() else splitColons(leftStr)
            val rightParts = if (rightStr.isEmpty()) emptyList() else splitColons(rightStr)

            if (leftParts.size + rightParts.size >= targetHextetCount) return null

            for (i in leftParts.indices) {
                hextets[i] = parseHexWord(leftParts[i]) ?: return null
            }

            val rightOffset = targetHextetCount - rightParts.size
            for (i in rightParts.indices) {
                hextets[rightOffset + i] = parseHexWord(rightParts[i]) ?: return null
            }
        }

        if (ipv4Bytes != null) {
            hextets[6] = ((ipv4Bytes[0].toInt() and 0xFF) shl 8) or (ipv4Bytes[1].toInt() and 0xFF)
            hextets[7] = ((ipv4Bytes[2].toInt() and 0xFF) shl 8) or (ipv4Bytes[3].toInt() and 0xFF)
        }

        val result = ByteArray(16)
        for (i in 0 until 8) {
            result[i * 2] = (hextets[i] ushr 8).toByte()
            result[i * 2 + 1] = (hextets[i] and 0xFF).toByte()
        }
        return result
    }

    private fun splitColons(s: String): List<String> {
        val result = ArrayList<String>(8)
        var start = 0
        for (i in 0 until s.length) {
            if (s[i] == ':') {
                result.add(s.substring(start, i))
                start = i + 1
            }
        }
        result.add(s.substring(start))
        return result
    }

    private fun parseHexWord(s: String): Int? {
        val len = s.length
        if (len !in 1..4) return null
        var value = 0
        for (i in 0 until len) {
            val c = s[i]
            val digit =
                when (c) {
                    in '0'..'9' -> c - '0'
                    in 'a'..'f' -> c - 'a' + 10
                    in 'A'..'F' -> c - 'A' + 10
                    else -> return null
                }
            value = (value shl 4) or digit
        }
        return value
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
}
