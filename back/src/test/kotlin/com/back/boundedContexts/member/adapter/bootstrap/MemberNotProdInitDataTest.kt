package com.back.boundedContexts.member.adapter.bootstrap

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.Member
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.mockito.Mockito.never

class MemberNotProdInitDataTest {
    private val memberUseCase: MemberUseCase = mock(MemberUseCase::class.java)
    private val fixture = MemberNotProdInitData(memberUseCase)

    @Test
    fun `기본 회원 시드는 누락된 fixture만 생성한다`() {
        given(memberUseCase.findByUsername("system")).willReturn(sampleMember("system", "시스템"))
        given(memberUseCase.findByUsername("holding")).willReturn(null)
        given(memberUseCase.findByUsername("admin")).willReturn(sampleMember("admin", "관리자"))
        given(memberUseCase.findByUsername("user1")).willReturn(sampleMember("user1", "유저1"))
        given(memberUseCase.findByUsername("user2")).willReturn(null)
        given(memberUseCase.findByUsername("user3")).willReturn(null)

        fixture.makeBaseMembers()

        then(memberUseCase).should().join("holding", "1234", "홀딩", null, null)
        then(memberUseCase).should().join("user2", "1234", "유저2", null, null)
        then(memberUseCase).should().join("user3", "1234", "유저3", null, null)
        then(memberUseCase).should(never()).join("system", "1234", "시스템", null, null)
        then(memberUseCase).should(never()).join("admin", "1234", "관리자", null, null)
        then(memberUseCase).should(never()).join("user1", "1234", "유저1", null, null)
    }

    private fun sampleMember(
        username: String,
        nickname: String,
    ): Member = Member(1, username, null, nickname)
}
