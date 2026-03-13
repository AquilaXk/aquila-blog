package com.back.boundedContexts.member.domain.shared.memberExtensions

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.app.AppConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class MemberSecurityExtensionsTest {
    @Test
    fun `관리자 회원은 ROLE_ADMIN 권한을 가진다`() {
        AppConfig(
            siteBackUrl = "https://api.aquilaxk.site",
            siteFrontUrl = "https://www.aquilaxk.site",
            adminUsername = "admin",
            adminPassword = "1234",
        )

        val admin =
            Member(
                id = 1,
                username = "admin",
                password = "1234",
                nickname = "관리자",
                email = "admin@example.com",
            )

        assertThat(admin.isAdmin).isTrue()
        assertThat(admin.authoritiesAsStringList).containsExactly("ROLE_MEMBER", "ROLE_ADMIN")
        assertThat(admin.authorities.map { it.authority }).containsExactly("ROLE_MEMBER", "ROLE_ADMIN")
    }

    @Test
    fun `일반 회원은 관리자 권한을 가지지 않는다`() {
        AppConfig(
            siteBackUrl = "https://api.aquilaxk.site",
            siteFrontUrl = "https://www.aquilaxk.site",
            adminUsername = "admin",
            adminPassword = "1234",
        )

        val user1 =
            Member(
                id = 2,
                username = "user1",
                password = "1234",
                nickname = "유저1",
                email = "user1@example.com",
            )

        assertThat(user1.isAdmin).isFalse()
        assertThat(user1.authoritiesAsStringList).containsExactly("ROLE_MEMBER")
        assertThat(user1.authorities.map { it.authority }).containsExactly("ROLE_MEMBER")
    }
}
