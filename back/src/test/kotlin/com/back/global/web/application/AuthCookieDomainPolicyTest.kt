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
    @DisplayName("same-origin 운영 조합(front·back 모두 blog)은 쿠키 도메인이 그 호스트 자신이다")
    fun `same origin production combination keeps cookie on the web host`() {
        // #1575 목표 위상: 공개 API가 web 호스트의 경로다. 공통 접미사 계산에 형제 호스트가
        // 끼어들 자리가 없어져 apex로 넓어질 경로 자체가 사라진다.
        val resolved =
            AuthCookieDomainPolicy.resolve(
                configuredDomain = "blog.aquilaxk.site",
                frontUrl = "https://blog.aquilaxk.site",
                backUrl = "https://blog.aquilaxk.site",
            )

        assertThat(resolved).isEqualTo("blog.aquilaxk.site")
        assertThat(resolved).isNotEqualTo("aquilaxk.site")
        assertThat(resolved).doesNotStartWith(".")
    }

    @Test
    @DisplayName("설정 도메인이 공통 접미사보다 넓으면 apex·www로 새지 않게 좁힌다")
    fun `configured domain wider than the shared suffix is narrowed`() {
        // CUSTOM_PROD_COOKIEDOMAIN 오타 하나로 세션 쿠키가 타 서비스 소유 호스트까지 전송되던
        // 경로다. env 계약(CI)만이 아니라 런타임에서도 막는다.
        for (wider in listOf("aquilaxk.site", "AQUILAXK.SITE", ".aquilaxk.site")) {
            val resolved =
                AuthCookieDomainPolicy.resolve(
                    configuredDomain = wider,
                    frontUrl = "https://blog.aquilaxk.site",
                    backUrl = "https://blog.aquilaxk.site",
                )

            assertThat(resolved).isEqualTo("blog.aquilaxk.site")
        }
    }

    @Test
    @DisplayName("same-origin이어도 설정 도메인이 하위 도메인이면 공통 접미사로 넓힌다")
    fun `same origin widens a narrower configured domain to the shared host`() {
        // front가 읽지 못하는 도메인으로 구우면 로그인 자체가 성립하지 않는다.
        val resolved =
            AuthCookieDomainPolicy.resolve(
                configuredDomain = "www.blog.aquilaxk.site",
                frontUrl = "https://blog.aquilaxk.site",
                backUrl = "https://blog.aquilaxk.site",
            )

        assertThat(resolved).isEqualTo("blog.aquilaxk.site")
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
