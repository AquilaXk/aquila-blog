package com.back.global.security.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("SecurityEndpointExposurePolicy 테스트")
class SecurityEndpointExposurePolicyTest {
    @Test
    @DisplayName("prod에서는 Swagger와 OpenAPI 문서를 익명 public으로 노출하지 않는다")
    fun `prod does not expose openapi publicly`() {
        val policy = SecurityEndpointExposurePolicy(isProd = true)

        assertThat(policy.allowsPublicPrometheus).isFalse()
        assertThat(policy.allowsPublicOpenApi).isFalse()
    }

    @Test
    @DisplayName("non-prod에서는 Prometheus와 OpenAPI 개발 경로를 유지한다")
    fun `non prod keeps diagnostics public for development`() {
        val policy = SecurityEndpointExposurePolicy(isProd = false)

        assertThat(policy.allowsPublicPrometheus).isTrue()
        assertThat(policy.allowsPublicOpenApi).isTrue()
    }
}
