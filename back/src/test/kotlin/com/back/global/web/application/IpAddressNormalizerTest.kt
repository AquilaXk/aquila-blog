package com.back.global.web.application

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("IpAddressNormalizer 순수 바이트 파서 및 엣지 케이스 단위 테스트")
class IpAddressNormalizerTest {
    @Test
    @DisplayName("null 또는 빈 입력")
    fun testBlankAndNull() {
        assertThat(IpAddressNormalizer.normalize(null)).isNull()
        assertThat(IpAddressNormalizer.normalize("")).isNull()
        assertThat(IpAddressNormalizer.normalize("   ")).isNull()
        assertThat(IpAddressNormalizer.normalizeRateLimitKey(null)).isEqualTo("unknown")
        assertThat(IpAddressNormalizer.normalizeRateLimitKeyOrNull("")).isNull()
    }

    @Test
    @DisplayName("유효하지 않은 IPv4 형식 Fail-Closed")
    fun testInvalidIpv4() {
        assertThat(IpAddressNormalizer.normalize("192.168.1")).isNull()
        assertThat(IpAddressNormalizer.normalize("192.168.1.256")).isNull()
        assertThat(IpAddressNormalizer.normalize("192.168.01.1")).isNull() // 선행 0
        assertThat(IpAddressNormalizer.normalize("192.168.1.1.1")).isNull()
        assertThat(IpAddressNormalizer.normalize("192.168.1.-1")).isNull()
        assertThat(IpAddressNormalizer.normalize("192.168.1.a")).isNull()
        assertThat(IpAddressNormalizer.normalize("... ")).isNull()
    }

    @Test
    @DisplayName("유효한 IPv4 및 IPv4 with Port")
    fun testValidIpv4() {
        assertThat(IpAddressNormalizer.normalize("127.0.0.1")).isEqualTo("127.0.0.1")
        assertThat(IpAddressNormalizer.normalize("10.0.0.1:80")).isEqualTo("10.0.0.1")
        assertThat(IpAddressNormalizer.normalize("10.0.0.1:0")).isNull() // 0번 포트 유효하지 않음
        assertThat(IpAddressNormalizer.normalize("10.0.0.1:65536")).isNull() // 65536 초과 포트
        assertThat(IpAddressNormalizer.normalize("10.0.0.1:port")).isNull()
    }

    @Test
    @DisplayName("대괄호 IPv6 파싱 및 포트 분리")
    fun testBracketIpv6() {
        assertThat(IpAddressNormalizer.normalize("[::1]")).isEqualTo("0:0:0:0:0:0:0:1")
        assertThat(IpAddressNormalizer.normalize("[::1]:8080")).isEqualTo("0:0:0:0:0:0:0:1")
        assertThat(IpAddressNormalizer.normalize("[::1]:invalid")).isNull()
        assertThat(IpAddressNormalizer.normalize("[::1")).isNull() // 닫는 대괄호 없음
        assertThat(IpAddressNormalizer.normalize("[]")).isNull()
        assertThat(IpAddressNormalizer.normalize("[::1]extra")).isNull() // 콜론 없이 뒤에 문자열
    }

    @Test
    @DisplayName("IPv6 다중 더블콜론 및 유효하지 않은 헥스테트 Fail-Closed")
    fun testInvalidIpv6() {
        assertThat(IpAddressNormalizer.normalize("1::2::3")).isNull()
        assertThat(IpAddressNormalizer.normalize("12345::1")).isNull() // 5자리 헥스
        assertThat(IpAddressNormalizer.normalize("1:2:3:4:5:6:7:8:9")).isNull() // 9개 헥스테트
        assertThat(IpAddressNormalizer.normalize("1:2:3:4:5:6:7")).isNull() // 7개 헥스테트인데 :: 없음
        assertThat(IpAddressNormalizer.normalize("1:2:3:4:5:6:7:g")).isNull() // 'g' 잘못된 문자
    }

    @Test
    @DisplayName("IPv4-mapped IPv6 및 embedded IPv4")
    fun testIpv4MappedIpv6() {
        assertThat(IpAddressNormalizer.normalize("::ffff:192.0.2.1")).isEqualTo("192.0.2.1")
        assertThat(IpAddressNormalizer.normalizeRateLimitKey("::ffff:192.0.2.1")).isEqualTo("192.0.2.1")
        assertThat(IpAddressNormalizer.normalize("::192.0.2.128")).isEqualTo("0:0:0:0:0:0:c000:280")
        assertThat(IpAddressNormalizer.normalize("2001:db8::192.0.2.128")).isEqualTo("2001:db8:0:0:0:0:c000:280")
        assertThat(IpAddressNormalizer.normalize("2001:db8::1:192.0.2.128")).isEqualTo("2001:db8:0:0:0:1:c000:280")
        assertThat(IpAddressNormalizer.normalize("1:2:3:4:5:6:192.0.2.128")).isEqualTo("1:2:3:4:5:6:c000:280")
        assertThat(IpAddressNormalizer.normalize(":::1")).isNull()
        assertThat(IpAddressNormalizer.normalize("[:192.0.2.128]")).isNull()
        assertThat(IpAddressNormalizer.normalize("::ffff:192.0.2.300")).isNull() // 잘못된 IPv4 임베디드
    }
}
