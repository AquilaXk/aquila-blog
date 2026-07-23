package com.back.global.security.config

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.app.AppConfig
import com.back.global.security.domain.SecurityUser
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.security.core.context.SecurityContextHolder

@DisplayName("SecurityContextAuthenticationWriter 테스트")
class SecurityContextAuthenticationWriterTest {
    @Test
    @DisplayName("회원 정보를 SecurityUser principal 인증으로 SecurityContext에 기록한다")
    fun writeMemberAuthenticationToSecurityContext() {
        AppConfig(
            siteBackUrl = "https://api.aquilaxk.site",
            siteFrontUrl = "https://www.aquilaxk.site",
        )
        val writer = SecurityContextAuthenticationWriter()
        val member = Member(54L, "internal-admin", null, "aquila", "admin@test.com", "admin-api-key")
        member.grantAdmin()

        try {
            writer.write(member)

            val authentication = requireNotNull(SecurityContextHolder.getContext().authentication)
            val principal = authentication.principal as SecurityUser

            assertThat(authentication.isAuthenticated).isTrue
            assertThat(principal.id).isEqualTo(54L)
            assertThat(principal.username).isEqualTo("internal-admin")
            assertThat(principal.nickname).isEqualTo("aquila")
            assertThat(authentication.authorities.map { it.authority }).contains("ROLE_ADMIN")
        } finally {
            SecurityContextHolder.clearContext()
        }
    }
}
