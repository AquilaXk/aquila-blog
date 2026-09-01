package com.back.global.security.application

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("AuthIpSecurityService 테스트")
class AuthIpSecurityServiceTest {
    @Test
    fun `normalizes an address and prefers the configured secret over the JWT fallback`() {
        val configured = AuthIpSecurityService(configuredHashSecret = "configured-secret", jwtSecretKey = "jwt-secret")
        val configuredWithDifferentJwt = AuthIpSecurityService(configuredHashSecret = "configured-secret", jwtSecretKey = "different-jwt")
        val fallback = AuthIpSecurityService(configuredHashSecret = "", jwtSecretKey = "jwt-secret")

        assertThat(configured.fingerprint(" 203.0.113.17 "))
            .isEqualTo(configured.fingerprint("203.0.113.17"))
            .isEqualTo(configuredWithDifferentJwt.fingerprint("203.0.113.17"))
            .isNotEqualTo(fallback.fingerprint("203.0.113.17"))
    }

    @Test
    fun `matches rejects null blank invalid and mismatched fingerprints while accepting a normalized match`() {
        val service = AuthIpSecurityService(configuredHashSecret = "configured-secret", jwtSecretKey = "jwt-secret")
        val expected = service.fingerprint("203.0.113.18")

        assertThat(service.matches(expected, " 203.0.113.18 ")).isTrue()
        assertThat(service.matches(null, "203.0.113.18")).isFalse()
        assertThat(service.matches(" ", "203.0.113.18")).isFalse()
        assertThat(service.matches(expected, "not-an-ip")).isFalse()
        assertThat(service.matches(expected, "203.0.113.19")).isFalse()
    }
}
