package com.back.boundedContexts.member.adapter.bootstrap

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.app.AdminProperties
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.mockito.Mockito.never

@org.junit.jupiter.api.DisplayName("MemberNotProdInitData 테스트")
class MemberNotProdInitDataTest {
    private val memberUseCase: MemberUseCase = mock(MemberUseCase::class.java)
    private val fixture =
        MemberNotProdInitData(
            memberUseCase,
            AdminProperties(username = "admin", email = "admin@test.com"),
        )

    @Test
    fun `기본 회원 시드는 누락된 fixture만 생성한다`() {
        given(memberUseCase.findByEmail("system@test.com")).willReturn(sampleMember("system", "시스템"))
        given(memberUseCase.findByEmail("holding@test.com")).willReturn(null)
        val adminMember = sampleMember("admin", "관리자")
        given(memberUseCase.findByEmail("admin@test.com")).willReturn(adminMember)
        given(memberUseCase.findByEmail("user1@test.com")).willReturn(sampleMember("user1", "유저1"))
        given(memberUseCase.findByEmail("user2@test.com")).willReturn(null)
        given(memberUseCase.findByEmail("user3@test.com")).willReturn(null)

        fixture.makeBaseMembers()

        then(memberUseCase).should().join("holding", "1234", "홀딩", null, "holding@test.com")
        then(memberUseCase).should().join("user2", "1234", "유저2", null, "user2@test.com")
        then(memberUseCase).should().join("user3", "1234", "유저3", null, "user3@test.com")
        then(memberUseCase).should(never()).join("system", "1234", "시스템", null, "system@test.com")
        then(memberUseCase).should(never()).join("admin", "1234", "관리자", null, "admin@test.com")
        then(memberUseCase).should(never()).join("user1", "1234", "유저1", null, "user1@test.com")
        assertThat(adminMember.isAdmin).isTrue()
    }

    private fun sampleMember(
        username: String,
        nickname: String,
    ): Member = Member(1, username, null, nickname)
}
