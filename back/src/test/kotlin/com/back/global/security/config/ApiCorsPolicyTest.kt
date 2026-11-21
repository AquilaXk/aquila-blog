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
                siteFrontUrl = "https://blog.aquilaxk.site",
                siteBackUrl = "https://api.blog.aquilaxk.site",
            )

        val patterns = policy.corsConfiguration().allowedOriginPatterns.orEmpty()

        assertThat(patterns).contains(
            "https://blog.aquilaxk.site",
            "https://api.blog.aquilaxk.site",
            "http://localhost:*",
            "http://127.0.0.1:*",
        )
        assertThat(policy.isAllowedOrigin("https://blog.aquilaxk.site")).isTrue
        assertThat(policy.isAllowedOrigin("http://localhost:3000")).isTrue
        assertThat(policy.isAllowedOrigin("https://evil.example")).isFalse
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
            )

        val patterns = policy.corsConfiguration().allowedOriginPatterns.orEmpty()

        assertThat(patterns).isEmpty()
    }

    @Test
    @DisplayName("allowlist는 frontUrl·backUrl에서만 만들고 쿠키 도메인 파생 origin을 만들지 않는다")
    fun `allowlist never derives origins from cookie domain`() {
        val environment =
            MockEnvironment()
                .withProperty("spring.profiles.active", "prod")
                // 쿠키 도메인이 어떤 값이든 allowlist는 그것에서 파생되지 않는다.
                // (ApiCorsPolicy는 더 이상 custom.site.cookieDomain을 주입받지 않는다)
                .withProperty("custom.site.cookieDomain", "blog.aquilaxk.site")
        val policy =
            ApiCorsPolicy(
                environment = environment,
                siteFrontUrl = "https://blog.aquilaxk.site",
                siteBackUrl = "https://api.blog.aquilaxk.site",
            )

        val patterns = policy.corsConfiguration().allowedOriginPatterns.orEmpty()

        assertThat(patterns).containsExactlyInAnyOrder(
            "https://blog.aquilaxk.site",
            "https://api.blog.aquilaxk.site",
        )
        // 제거된 파생 규칙이 만들던 origin: https://<cookieDomain> / https://www.<cookieDomain>
        assertThat(patterns).doesNotContain("https://www.blog.aquilaxk.site")
        assertThat(policy.isAllowedOrigin("https://www.blog.aquilaxk.site")).isFalse
    }

    @Test
    @DisplayName("쿠키 도메인이 apex로 잘못 설정돼도 타 서비스 origin이 allowlist에 들어가지 않는다")
    fun `apex cookie domain never leaks other service origins into allowlist`() {
        val environment =
            MockEnvironment()
                .withProperty("spring.profiles.active", "prod")
                // 오설정 시나리오: apex와 www는 타 서비스 소유다.
                .withProperty("custom.site.cookieDomain", "aquilaxk.site")
        val policy =
            ApiCorsPolicy(
                environment = environment,
                siteFrontUrl = "https://blog.aquilaxk.site",
                siteBackUrl = "https://api.blog.aquilaxk.site",
            )

        val patterns = policy.corsConfiguration().allowedOriginPatterns.orEmpty()

        assertThat(patterns).doesNotContain(
            "https://aquilaxk.site",
            "https://www.aquilaxk.site",
        )
        assertThat(policy.isAllowedOrigin("https://aquilaxk.site")).isFalse
        assertThat(policy.isAllowedOrigin("https://www.aquilaxk.site")).isFalse
    }

    @Test
    @DisplayName("prod에서 blog origin만 허용하고 apex·www·www.blog origin은 거부한다")
    fun `prod allows blog origin and rejects apex www origins`() {
        val environment = MockEnvironment().withProperty("spring.profiles.active", "prod")
        val policy =
            ApiCorsPolicy(
                environment = environment,
                siteFrontUrl = "https://blog.aquilaxk.site",
                siteBackUrl = "https://api.blog.aquilaxk.site",
            )

        assertThat(policy.isAllowedOrigin("https://blog.aquilaxk.site")).isTrue
        assertThat(policy.isAllowedOrigin("https://api.blog.aquilaxk.site")).isTrue

        assertThat(policy.isAllowedOrigin("https://aquilaxk.site")).isFalse
        assertThat(policy.isAllowedOrigin("https://www.aquilaxk.site")).isFalse
        assertThat(policy.isAllowedOrigin("https://www.blog.aquilaxk.site")).isFalse
        assertThat(policy.isAllowedOrigin("https://blog.aquilaxk.site.evil.example")).isFalse
        assertThat(policy.isAllowedOrigin("http://localhost:3000")).isFalse
    }

    @Test
    @DisplayName("credential CORS 요청 헤더는 운영에 필요한 명시 목록만 허용한다")
    fun `cors allowed headers use explicit production allowlist`() {
        val environment = MockEnvironment().withProperty("spring.profiles.active", "prod")
        val policy =
            ApiCorsPolicy(
                environment = environment,
                siteFrontUrl = "https://blog.aquilaxk.site",
                siteBackUrl = "https://api.blog.aquilaxk.site",
            )

        val allowedHeaders = policy.corsConfiguration().allowedHeaders.orEmpty()

        assertThat(allowedHeaders).containsExactlyInAnyOrder(
            "Accept",
            "Authorization",
            "Content-Type",
            "If-None-Match",
            "Idempotency-Key",
            "Last-Event-ID",
            "Range",
            "X-Aquila-CSRF",
            "X-Request-ID",
        )
        assertThat(allowedHeaders).doesNotContain(
            "*",
            "X-Forwarded-For",
            "X-Real-IP",
            "CF-Connecting-IP",
            "True-Client-IP",
        )
    }
}
