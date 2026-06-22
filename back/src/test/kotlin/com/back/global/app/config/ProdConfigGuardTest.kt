package com.back.global.app.config

import com.back.global.app.AdminProperties
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.boot.DefaultApplicationArguments

@DisplayName("ProdConfigGuard 테스트")
class ProdConfigGuardTest {
    @Test
    @DisplayName("prod에서 AI 태그 추천은 정책 확인 값 없이 활성화할 수 없다")
    fun `ai tag recommendation requires policy confirmations in prod`() {
        val guard = createGuard(aiTagEnabled = true)

        assertThatThrownBy { guard.run(DefaultApplicationArguments()) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("custom.ai.tag.enabled requires confirmed DPA")
    }

    @Test
    @DisplayName("prod에서 AI 태그 추천 정책 확인 값이 모두 있으면 부팅을 허용한다")
    fun `ai tag recommendation allows prod boot when policy confirmations are present`() {
        val guard =
            createGuard(
                aiTagEnabled = true,
                aiTagDpaConfirmed = true,
                aiTagRegionConfirmed = true,
                aiTagRetentionConfirmed = true,
                aiTagTrainingOptOutConfirmed = true,
                aiTagProcessorRegistryConfirmed = true,
            )

        assertThatCode { guard.run(DefaultApplicationArguments()) }.doesNotThrowAnyException()
    }

    private fun createGuard(
        aiTagEnabled: Boolean,
        aiTagDpaConfirmed: Boolean = false,
        aiTagRegionConfirmed: Boolean = false,
        aiTagRetentionConfirmed: Boolean = false,
        aiTagTrainingOptOutConfirmed: Boolean = false,
        aiTagProcessorRegistryConfirmed: Boolean = false,
    ): ProdConfigGuard =
        ProdConfigGuard(
            cookieDomain = "blog.oa.gg",
            frontUrl = "https://www.blog.oa.gg",
            backUrl = "https://api.blog.oa.gg",
            aiTagEnabled = aiTagEnabled,
            aiTagDpaConfirmed = aiTagDpaConfirmed,
            aiTagRegionConfirmed = aiTagRegionConfirmed,
            aiTagRetentionConfirmed = aiTagRetentionConfirmed,
            aiTagTrainingOptOutConfirmed = aiTagTrainingOptOutConfirmed,
            aiTagProcessorRegistryConfirmed = aiTagProcessorRegistryConfirmed,
            adminProperties =
                AdminProperties(
                    username = "admin",
                    email = "admin@example.com",
                    password = "secret-password",
                ),
        )
}
