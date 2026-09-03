package com.back.boundedContexts.member.dto

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.global.app.AppConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.Isolated
import java.lang.reflect.Field
import java.time.Instant

@Isolated
class MemberWithUsernameDtoTest {
    @Test
    fun `empty canonical workspace uses the canonical default image`() =
        withIsolatedAppConfig {
            val member = createMember()
            val response = MemberWithUsernameDto(member, MemberProfileWorkspaceContent(), TEST_INSTANT)

            assertThat(response.profileImageUrl).isEqualTo("https://blog.aquilaxk.site/images/default-profile.svg")
            assertThat(response.profileImageDirectUrl).isEqualTo(response.profileImageUrl)
            Unit
        }

    @Test
    fun `published workspace profile image responses canonicalize after versioning`() =
        withIsolatedAppConfig {
            val member = createMember()
            val modifiedAt = TEST_INSTANT
            val workspace =
                MemberProfileWorkspaceContent(
                    profileImageUrl = "$RETIRED_BACK_URL/post/api/v1/images/profile/workspace.png",
                )

            val response = MemberWithUsernameDto(member, workspace, modifiedAt)
            val expected =
                "$CURRENT_BACK_URL/post/api/v1/images/profile/workspace.png?v=${modifiedAt.toEpochMilli()}"

            assertThat(response.profileImageUrl).isEqualTo(expected)
            assertThat(response.profileImageDirectUrl).isEqualTo(expected)
            Unit
        }

    private fun createMember(): Member =
        Member(1, "admin", null, "관리자", "admin@example.com", true).apply {
            createdAt = TEST_INSTANT
            modifiedAt = TEST_INSTANT
        }

    private fun <T> withIsolatedAppConfig(block: () -> T): T {
        val snapshot = appConfigUrlFields.map { field -> field.get(null) }
        AppConfig(CURRENT_BACK_URL, "https://blog.aquilaxk.site")

        return try {
            block()
        } finally {
            appConfigUrlFields.zip(snapshot).forEach { (field, value) -> field.set(null, value) }
        }
    }

    private val appConfigUrlFields: List<Field> by lazy {
        listOf("siteBackUrl", "siteFrontUrl").map { name ->
            AppConfig::class.java.getDeclaredField(name).apply { isAccessible = true }
        }
    }

    private companion object {
        const val RETIRED_BACK_URL = "https://api.aquilaxk.site"
        const val CURRENT_BACK_URL = "https://api.current-aquilaxk.site"
        val TEST_INSTANT: Instant = Instant.parse("2026-08-31T00:00:00Z")
    }
}
