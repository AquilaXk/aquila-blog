package com.back.global.web.application

import java.util.Locale

/**
 * 인증 쿠키 도메인 정책을 한 곳에서 정규화해 SSR/CSR 인증 일관성을 유지한다.
 * 운영 설정이 subdomain(api/www)로 들어와도 front/back 공통 사이트 도메인으로 보정한다.
 *
 * front와 back이 같은 호스트인 same-origin 위상(#1575)에서는 공통 접미사가 그 호스트 자신이라,
 * 쿠키가 상위 도메인으로 넓어질 경로 자체가 없다.
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

        // 공통 접미사는 front와 back이 모두 읽을 수 있는 가장 좁은 도메인이다. 설정값이 그보다
        // 좁으면(front가 못 읽는다) 넓히고, 넓으면(우리 소유가 아닌 상위 호스트까지 전송된다)
        // 좁힌다. 넓은 쪽을 그대로 두던 예전 동작에서는 CUSTOM_PROD_COOKIEDOMAIN 오타 하나가
        // apex로 세션 쿠키를 보냈고, 그것을 막는 층이 env 계약(CI)뿐이었다.
        //
        // 한계: 이 clamp가 막는 것은 "설정값이 공통 접미사보다 넓은" 경우뿐이다. backUrl 자체가
        // 형제 subtree(api.<apex>)면 공통 접미사가 곧 apex라 여기서 apex가 정답이 되고, 그대로
        // 구워진다(아래 회귀 테스트가 그 동작을 고정한다). 그 조합을 막는 층은 이 코드가 아니라
        // env 계약의 topology 불변식이다 - 런타임 방어는 부분적이고, 전면 방어는 계약 쪽에 있다.
        val relatedToSharedDomain =
            isSubdomainOf(sanitizedConfiguredDomain, sharedSiteDomain) ||
                isSubdomainOf(sharedSiteDomain, sanitizedConfiguredDomain)

        return if (relatedToSharedDomain) sharedSiteDomain else sanitizedConfiguredDomain
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
