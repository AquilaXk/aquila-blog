package com.back.global.security.config.oauth2

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.env.YamlPropertySourceLoader
import org.springframework.core.io.ClassPathResource

class KakaoOidcConfigurationContractTest {
    @Test
    fun `Kakao OIDC YAML contract is fixed without an ApplicationContext or provider call`() {
        val properties =
            YamlPropertySourceLoader()
                .load("application.yaml", ClassPathResource("application.yaml"))
                .single()

        assertThat(properties.getProperty("spring.security.oauth2.client.registration.kakao.client-id"))
            .isEqualTo("\${SPRING__SECURITY__OAUTH2__CLIENT__REGISTRATION__KAKAO__CLIENT_ID:}")
        assertThat(
            (properties.getProperty("spring.security.oauth2.client.registration.kakao.scope") as String)
                .split(",")
                .map(String::trim),
        ).containsExactlyInAnyOrder("openid", "profile_nickname", "profile_image")
        assertThat(properties.getProperty("spring.security.oauth2.client.registration.kakao.authorization-grant-type"))
            .isEqualTo("authorization_code")
        assertThat(properties.getProperty("spring.security.oauth2.client.registration.kakao.redirect-uri"))
            .isEqualTo("\${custom.site.backUrl}/login/oauth2/code/{registrationId}")
        assertThat(properties.getProperty("spring.security.oauth2.client.provider.kakao.issuer-uri"))
            .isEqualTo("https://kauth.kakao.com")
        assertThat(properties.getProperty("spring.security.oauth2.client.provider.kakao.authorization-uri"))
            .isEqualTo("https://kauth.kakao.com/oauth/authorize")
        assertThat(properties.getProperty("spring.security.oauth2.client.provider.kakao.token-uri"))
            .isEqualTo("https://kauth.kakao.com/oauth/token")
        assertThat(properties.getProperty("spring.security.oauth2.client.provider.kakao.jwk-set-uri"))
            .isEqualTo("https://kauth.kakao.com/.well-known/jwks.json")
        assertThat(properties.getProperty("spring.security.oauth2.client.provider.kakao.user-info-uri"))
            .isEqualTo("https://kapi.kakao.com/v1/oidc/userinfo")
        assertThat(properties.getProperty("spring.security.oauth2.client.provider.kakao.user-name-attribute"))
            .isEqualTo("sub")
    }
}
