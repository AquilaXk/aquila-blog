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
                configuredDomain = "api.aquilaxk.site",
                frontUrl = "https://www.aquilaxk.site",
                backUrl = "https://api.aquilaxk.site",
            )

        assertThat(resolved).isEqualTo("aquilaxk.site")
    }

    @Test
    @DisplayName("설정 도메인이 URL 형태여도 host만 추출하고 공통 사이트 도메인으로 정규화한다")
    fun `normalize url like configured domain`() {
        val resolved =
            AuthCookieDomainPolicy.resolve(
                configuredDomain = "https://www.aquilaxk.site",
                frontUrl = "https://www.aquilaxk.site",
                backUrl = "https://api.aquilaxk.site",
            )

        assertThat(resolved).isEqualTo("aquilaxk.site")
    }

    @Test
    @DisplayName("설정 도메인이 이미 사이트 도메인이면 그대로 유지한다")
    fun `keep apex domain when already correct`() {
        val resolved =
            AuthCookieDomainPolicy.resolve(
                configuredDomain = "aquilaxk.site",
                frontUrl = "https://www.aquilaxk.site",
                backUrl = "https://api.aquilaxk.site",
            )

        assertThat(resolved).isEqualTo("aquilaxk.site")
    }

    @Test
    @DisplayName("설정 도메인이 비어 있으면 domain 속성을 설정하지 않는다")
    fun `empty configured domain stays empty`() {
        val resolved =
            AuthCookieDomainPolicy.resolve(
                configuredDomain = "",
                frontUrl = "https://www.aquilaxk.site",
                backUrl = "https://api.aquilaxk.site",
            )

        assertThat(resolved).isEmpty()
    }
}
