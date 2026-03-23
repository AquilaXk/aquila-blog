package com.back.global.security.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment

@DisplayName("ApiCorsPolicy 테스트")
class ApiCorsPolicyTest {
    @Test
    @DisplayName("prod가 아니면 localhost origin 패턴을 허용한다")
    fun `non prod includes localhost origins`() {
        val environment = MockEnvironment().withProperty("spring.profiles.active", "dev")
        val policy =
            ApiCorsPolicy(
                environment = environment,
                siteFrontUrl = "https://www.aquilaxk.site",
                siteBackUrl = "https://api.aquilaxk.site",
                siteCookieDomain = "aquilaxk.site",
            )

        val patterns = policy.corsConfiguration().allowedOriginPatterns.orEmpty()

        assertThat(patterns).contains(
            "https://www.aquilaxk.site",
            "https://api.aquilaxk.site",
            "https://aquilaxk.site",
            "http://localhost:*",
            "http://127.0.0.1:*",
        )
    }

    @Test
    @DisplayName("prod에서 사이트 설정값이 비어 있어도 예외 없이 초기화된다")
    fun `prod initialization tolerates blank site config`() {
        val environment = MockEnvironment().withProperty("spring.profiles.active", "prod")
        val policy =
            ApiCorsPolicy(
                environment = environment,
                siteFrontUrl = "",
                siteBackUrl = "",
                siteCookieDomain = "",
            )

        val patterns = policy.corsConfiguration().allowedOriginPatterns.orEmpty()

        assertThat(patterns).isEmpty()
    }
}
