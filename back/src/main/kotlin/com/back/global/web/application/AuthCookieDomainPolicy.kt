package com.back.global.web.application

import java.util.Locale

/**
 * 인증 쿠키 도메인 정책을 한 곳에서 정규화해 SSR/CSR 인증 일관성을 유지한다.
 * 운영 설정이 subdomain(api/www)로 들어와도 front/back 공통 사이트 도메인으로 보정한다.
 */
object AuthCookieDomainPolicy {
    fun resolve(
        configuredDomain: String,
        frontUrl: String,
        backUrl: String,
    ): String {
        val sanitizedConfiguredDomain = sanitizeDomain(configuredDomain)
        val frontHost = sanitizeDomain(extractHost(frontUrl))
        val backHost = sanitizeDomain(extractHost(backUrl))
        val sharedSiteDomain = inferSharedSiteDomain(frontHost, backHost)

        if (sanitizedConfiguredDomain.isBlank()) {
            return ""
        }

        if (sharedSiteDomain.isBlank()) {
            return sanitizedConfiguredDomain
        }

        return if (isSubdomainOf(sanitizedConfiguredDomain, sharedSiteDomain)) {
            sharedSiteDomain
        } else {
            sanitizedConfiguredDomain
        }
    }

    internal fun sanitizeDomain(raw: String): String {
        if (raw.isBlank()) return ""

        val trimmed = raw.trim()
        val withoutScheme = trimmed.substringAfter("://", trimmed)
        val hostPortAndPath = withoutScheme.substringBefore('/')
        val hostPort = hostPortAndPath.substringBefore('?').substringBefore('#')
        val withoutPort = hostPort.substringBefore(':')

        return withoutPort
            .trim()
            .trimStart('.')
            .trimEnd('.')
            .lowercase(Locale.ROOT)
    }

    private fun extractHost(url: String): String {
        val normalized = url.trim()
        if (normalized.isBlank()) return ""

        val withoutScheme = normalized.substringAfter("://", normalized)
        return withoutScheme.substringBefore('/')
    }

    private fun inferSharedSiteDomain(
        frontHost: String,
        backHost: String,
    ): String {
        if (frontHost.isBlank() || backHost.isBlank()) return ""

        val frontParts = frontHost.split('.').filter { it.isNotBlank() }
        val backParts = backHost.split('.').filter { it.isNotBlank() }
        if (frontParts.size < 2 || backParts.size < 2) return ""

        val sharedReversed = mutableListOf<String>()
        var frontIndex = frontParts.lastIndex
        var backIndex = backParts.lastIndex

        while (frontIndex >= 0 && backIndex >= 0) {
            val frontLabel = frontParts[frontIndex]
            val backLabel = backParts[backIndex]
            if (frontLabel != backLabel) break
            sharedReversed.add(frontLabel)
            frontIndex--
            backIndex--
        }

        if (sharedReversed.size < 2) return ""

        return sharedReversed.reversed().joinToString(".")
    }

    private fun isSubdomainOf(
        candidateDomain: String,
        parentDomain: String,
    ): Boolean {
        if (candidateDomain == parentDomain) return true
        return candidateDomain.endsWith(".$parentDomain")
    }
}
