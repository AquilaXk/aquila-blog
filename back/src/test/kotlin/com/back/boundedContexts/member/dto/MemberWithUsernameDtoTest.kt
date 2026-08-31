package com.back.boundedContexts.member.dto

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.global.app.AppConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant

class MemberWithUsernameDtoTest {
    @BeforeEach
    fun setUp() {
        AppConfig(CURRENT_BACK_URL, "https://blog.aquilaxk.site")
    }

    @Test
    fun `member profile image responses canonicalize the retired public host`() {
        val member = createMember()
        member.profileImgUrl = "$RETIRED_BACK_URL/post/api/v1/images/profile/member.png"

        val response = MemberWithUsernameDto(member)

        assertThat(response.profileImageUrl)
            .startsWith("$CURRENT_BACK_URL/post/api/v1/images/profile/member.png?v=")
        assertThat(response.profileImageDirectUrl).isEqualTo(response.profileImageUrl)
    }

    @Test
    fun `published workspace profile image responses canonicalize after versioning`() {
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
    }

    private fun createMember(): Member =
        Member(1, "admin", null, "관리자", "admin@example.com", true).apply {
            createdAt = TEST_INSTANT
            modifiedAt = TEST_INSTANT
        }

    private companion object {
        const val RETIRED_BACK_URL = "https://api.aquilaxk.site"
        const val CURRENT_BACK_URL = "https://api.current-aquilaxk.site"
        val TEST_INSTANT: Instant = Instant.parse("2026-08-31T00:00:00Z")
    }
}
