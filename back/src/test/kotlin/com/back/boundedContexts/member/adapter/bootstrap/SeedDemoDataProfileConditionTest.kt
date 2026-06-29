package com.back.boundedContexts.member.adapter.bootstrap

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.post.adapter.bootstrap.PostNotProdInitData
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.global.app.AdminProperties
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.mockito.Mockito.mock
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import java.util.function.Supplier

class SeedDemoDataProfileConditionTest {
    private val runner =
        ApplicationContextRunner()
            .withUserConfiguration(
                MemberNotProdInitData::class.java,
                PostNotProdInitData::class.java,
            ).withBean(MemberUseCase::class.java, Supplier { mock(MemberUseCase::class.java) })
            .withBean(PostUseCase::class.java, Supplier { mock(PostUseCase::class.java) })
            .withBean(PostRepositoryPort::class.java, Supplier { mock(PostRepositoryPort::class.java) })
            .withBean(AdminProperties::class.java, Supplier { AdminProperties(username = "admin", email = "admin@test.com") })

    @ParameterizedTest
    @ValueSource(strings = ["local", "dev", "test"])
    fun `explicit safe profile with opt-in flag loads demo seed beans`(profile: String) {
        runner
            .withPropertyValues(
                "spring.profiles.active=$profile",
                "custom.bootstrap.seed-demo-data-enabled=true",
            ).run { context ->
                assertThat(context).hasSingleBean(MemberNotProdInitData::class.java)
                assertThat(context).hasSingleBean(PostNotProdInitData::class.java)
            }
    }

    @Test
    fun `safe profile without opt-in flag does not load demo seed beans`() {
        runner
            .withPropertyValues("spring.profiles.active=local")
            .run { context ->
                assertThat(context).doesNotHaveBean(MemberNotProdInitData::class.java)
                assertThat(context).doesNotHaveBean(PostNotProdInitData::class.java)
            }
    }

    @ParameterizedTest
    @ValueSource(strings = ["staging", "preview", "qa", "release", "prod"])
    fun `prod-like profile does not load demo seed beans even with opt-in flag`(profile: String) {
        runner
            .withPropertyValues(
                "spring.profiles.active=$profile",
                "custom.bootstrap.seed-demo-data-enabled=true",
            ).run { context ->
                assertThat(context).doesNotHaveBean(MemberNotProdInitData::class.java)
                assertThat(context).doesNotHaveBean(PostNotProdInitData::class.java)
            }
    }

    @ParameterizedTest
    @ValueSource(strings = ["prod,dev", "staging,test", "preview,local", "qa,dev", "release,test"])
    fun `mixed prod-like profile does not load demo seed beans even with opt-in flag`(profiles: String) {
        runner
            .withPropertyValues(
                "spring.profiles.active=$profiles",
                "custom.bootstrap.seed-demo-data-enabled=true",
            ).run { context ->
                assertThat(context).doesNotHaveBean(MemberNotProdInitData::class.java)
                assertThat(context).doesNotHaveBean(PostNotProdInitData::class.java)
            }
    }
}
