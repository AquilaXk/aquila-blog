package com.back.global.web.application

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("AuthCookieDomainPolicy 테스트")
class AuthCookieDomainPolicyTest {
    @Test
    @DisplayName("설정 도메인이 api 서브도메인이면 front/back 공통 사이트 도메인으로 정규화한다")
    fun `normalize api subdomain to shared site domain`() {
        val resolved =
            AuthCookieDomainPolicy.resolve(
                configuredDomain = "api.blog.aquilaxk.site",
                frontUrl = "https://blog.aquilaxk.site",
                backUrl = "https://api.blog.aquilaxk.site",
            )

        assertThat(resolved).isEqualTo("blog.aquilaxk.site")
    }

    @Test
    @DisplayName("설정 도메인이 URL 형태여도 host만 추출하고 공통 사이트 도메인으로 정규화한다")
    fun `normalize url like configured domain`() {
        val resolved =
            AuthCookieDomainPolicy.resolve(
                configuredDomain = "https://blog.aquilaxk.site",
                frontUrl = "https://blog.aquilaxk.site",
                backUrl = "https://api.blog.aquilaxk.site",
            )

        assertThat(resolved).isEqualTo("blog.aquilaxk.site")
    }

    @Test
    @DisplayName("설정 도메인이 이미 사이트 도메인이면 그대로 유지한다")
    fun `keep site domain when already correct`() {
        val resolved =
            AuthCookieDomainPolicy.resolve(
                configuredDomain = "blog.aquilaxk.site",
                frontUrl = "https://blog.aquilaxk.site",
                backUrl = "https://api.blog.aquilaxk.site",
            )

        assertThat(resolved).isEqualTo("blog.aquilaxk.site")
    }

    @Test
    @DisplayName("운영 조합(front blog + back api.blog)은 쿠키 도메인을 blog 하위로 제한한다")
    fun `home server production combination scopes cookie to blog subtree`() {
        val resolved =
            AuthCookieDomainPolicy.resolve(
                configuredDomain = "blog.aquilaxk.site",
                frontUrl = "https://blog.aquilaxk.site",
                backUrl = "https://api.blog.aquilaxk.site",
            )

        assertThat(resolved).isEqualTo("blog.aquilaxk.site")
        // apex와 www는 타 서비스 소유다. 쿠키가 그쪽으로 새면 안 된다.
        assertThat(resolved).isNotEqualTo("aquilaxk.site")
        assertThat(resolved).doesNotStartWith(".")
    }

    @Test
    @DisplayName("회귀 방지: back이 구 api 도메인이면 공통 접미사가 apex로 떨어져 쿠키가 타 서비스로 샌다")
    fun `legacy api host on sibling subtree falls back to apex`() {
        val resolved =
            AuthCookieDomainPolicy.resolve(
                configuredDomain = "blog.aquilaxk.site",
                frontUrl = "https://blog.aquilaxk.site",
                // 전환 전 상태: api가 blog의 형제라서 공통 접미사가 apex가 된다.
                backUrl = "https://api.aquilaxk.site",
            )

        // 이 값이 바로 이번 전환이 막으려는 상태다. CUSTOM_PROD_BACKURL/API_DOMAIN이
        // api.blog.aquilaxk.site로 유지되지 않으면 쿠키 스코프가 여기로 넓어진다.
        assertThat(resolved).isEqualTo("aquilaxk.site")
    }

    @Test
    @DisplayName("설정 도메인이 비어 있으면 domain 속성을 설정하지 않는다")
    fun `empty configured domain stays empty`() {
        val resolved =
            AuthCookieDomainPolicy.resolve(
                configuredDomain = "",
                frontUrl = "https://blog.aquilaxk.site",
                backUrl = "https://api.blog.aquilaxk.site",
            )

        assertThat(resolved).isEmpty()
    }
}
