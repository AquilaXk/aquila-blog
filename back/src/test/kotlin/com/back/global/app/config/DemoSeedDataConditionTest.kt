package com.back.global.app.config

import com.back.boundedContexts.member.adapter.bootstrap.MemberNotProdInitData
import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.post.adapter.bootstrap.PostNotProdInitData
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.global.app.AdminProperties
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.boot.test.context.runner.ApplicationContextRunner

@DisplayName("DemoSeedDataCondition 테스트")
class DemoSeedDataConditionTest {
    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(
                MemberNotProdInitData::class.java,
                PostNotProdInitData::class.java,
            ).withBean(MemberUseCase::class.java, { mock(MemberUseCase::class.java) })
            .withBean(PostUseCase::class.java, { mock(PostUseCase::class.java) })
            .withBean(PostRepositoryPort::class.java, { mock(PostRepositoryPort::class.java) })
            .withBean(AdminProperties::class.java, { AdminProperties(username = "admin", email = "admin@test.com") })

    @Test
    fun `test profile and explicit flag load demo seed beans`() {
        contextRunner
            .withPropertyValues(
                "spring.profiles.active=test",
                "custom.bootstrap.seed-demo-data-enabled=true",
            ).run { context ->
                assertThat(context).hasSingleBean(MemberNotProdInitData::class.java)
                assertThat(context).hasSingleBean(PostNotProdInitData::class.java)
            }
    }

    @Test
    fun `allowed profile without explicit flag does not load demo seed beans`() {
        contextRunner
            .withPropertyValues("spring.profiles.active=local")
            .run { context ->
                assertThat(context).doesNotHaveBean(MemberNotProdInitData::class.java)
                assertThat(context).doesNotHaveBean(PostNotProdInitData::class.java)
            }
    }

    @Test
    fun `prod-like profiles do not load demo seed beans even when flag is true`() {
        listOf("prod", "production", "staging", "preview", "qa", "release", "release-candidate", "releasecandidate")
            .forEach { profile ->
                contextRunner
                    .withPropertyValues(
                        "spring.profiles.active=$profile",
                        "custom.bootstrap.seed-demo-data-enabled=true",
                    ).run { context ->
                        assertThat(context).doesNotHaveBean(MemberNotProdInitData::class.java)
                        assertThat(context).doesNotHaveBean(PostNotProdInitData::class.java)
                    }
            }
    }

    @Test
    fun `prod-like profile wins when combined with allowed profile`() {
        listOf("test,preview", "dev,production", "test,releasecandidate").forEach { profiles ->
            contextRunner
                .withPropertyValues(
                    "spring.profiles.active=$profiles",
                    "custom.bootstrap.seed-demo-data-enabled=true",
                ).run { context ->
                    assertThat(context).doesNotHaveBean(MemberNotProdInitData::class.java)
                    assertThat(context).doesNotHaveBean(PostNotProdInitData::class.java)
                }
        }
    }
}
