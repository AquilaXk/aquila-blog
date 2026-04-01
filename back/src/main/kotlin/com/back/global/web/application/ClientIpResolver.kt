package com.back.global.web.application

import jakarta.servlet.http.HttpServletRequest
import org.springframework.stereotype.Component
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress

/**
 * 프록시 환경에서 신뢰 가능한 클라이언트 IP를 추출한다.
 * - remoteAddr가 내부 프록시(사설/루프백/link-local)일 때만 전달 헤더를 신뢰
 * - Cloudflare/Reverse proxy 헤더 우선순위로 실제 클라이언트 IP를 복원
 */
@Component
class ClientIpResolver {
    fun resolve(request: HttpServletRequest): String {
        val remoteIp = IpAddressNormalizer.normalize(request.remoteAddr)

        if (remoteIp != null && isTrustedProxyAddress(remoteIp)) {
            resolveForwardedClientIp(request)?.let { return it }
        }

        return remoteIp.orEmpty()
    }

    private fun resolveForwardedClientIp(request: HttpServletRequest): String? {
        resolveSingleHeaderIp(request, "CF-Connecting-IP")?.let { return it }
        resolveSingleHeaderIp(request, "True-Client-IP")?.let { return it }
        resolveSingleHeaderIp(request, "X-Real-IP")?.let { return it }

        val forwardedFor = request.getHeader("X-Forwarded-For") ?: return null
        forwardedFor
            .split(',')
            .asSequence()
            .mapNotNull { IpAddressNormalizer.normalize(it) }
            .firstOrNull()
            ?.let { return it }

        return null
    }

    private fun resolveSingleHeaderIp(
        request: HttpServletRequest,
        headerName: String,
    ): String? = IpAddressNormalizer.normalize(request.getHeader(headerName))

    private fun isTrustedProxyAddress(ip: String): Boolean {
        val address = runCatching { InetAddress.getByName(ip) }.getOrNull() ?: return false

        if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isSiteLocalAddress || address.isLinkLocalAddress) {
            return true
        }

        if (address is Inet4Address) {
            val bytes = address.address
            val first = bytes[0].toInt() and 0xFF
            val second = bytes[1].toInt() and 0xFF

            // RFC6598 carrier-grade NAT(100.64.0.0/10)
            if (first == 100 && second in 64..127) return true
        }

        if (address is Inet6Address) {
            val first = address.address[0].toInt() and 0xFF
            // Unique local address(fc00::/7)
            if ((first and 0xFE) == 0xFC) return true
        }

        return false
    }
}
