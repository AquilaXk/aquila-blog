package com.back.global.web.application

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockHttpServletRequest

@DisplayName("ClientIpResolver 테스트")
class ClientIpResolverTest {
    private val resolver = ClientIpResolver()

    @Test
    @DisplayName("신뢰 프록시 remoteAddr이면 CF-Connecting-IP를 우선 사용한다")
    fun `trusted proxy prefers cf connecting ip`() {
        val request = MockHttpServletRequest("GET", "/member/api/v1/auth/me")
        request.remoteAddr = "172.18.0.5"
        request.addHeader("CF-Connecting-IP", "198.51.100.24")

        assertThat(resolver.resolve(request)).isEqualTo("198.51.100.24")
    }

    @Test
    @DisplayName("직접 유입(public remoteAddr) 요청에서는 전달 헤더를 신뢰하지 않는다")
    fun `public remote addr ignores forwarded header`() {
        val request = MockHttpServletRequest("GET", "/member/api/v1/auth/me")
        request.remoteAddr = "203.0.113.10"
        request.addHeader("CF-Connecting-IP", "198.51.100.24")
        request.addHeader("X-Forwarded-For", "198.51.100.30")

        assertThat(resolver.resolve(request)).isEqualTo("203.0.113.10")
    }

    @Test
    @DisplayName("신뢰 프록시에서 CF 헤더가 없으면 X-Forwarded-For 첫 번째 IP를 사용한다")
    fun `trusted proxy falls back to x forwarded for first ip`() {
        val request = MockHttpServletRequest("GET", "/member/api/v1/auth/me")
        request.remoteAddr = "10.0.0.8"
        request.addHeader("X-Forwarded-For", "198.51.100.45, 198.51.100.46")

        assertThat(resolver.resolve(request)).isEqualTo("198.51.100.45")
    }
}
