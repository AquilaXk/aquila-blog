package com.back.boundedContexts.post.adapter.bootstrap

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.mockito.Mockito.never

@org.junit.jupiter.api.DisplayName("PostNotProdInitData 테스트")
class PostNotProdInitDataTest {
    private val memberUseCase: MemberUseCase = mock(MemberUseCase::class.java)
    private val postUseCase: PostUseCase = mock(PostUseCase::class.java)
    private val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
    private val fixture = PostNotProdInitData(memberUseCase, postUseCase, postRepository)

    @Test
    fun `기본 게시글 시드는 누락된 fixture만 생성한다`() {
        val user1 = sampleMember(1, "user1", "유저1")
        val user2 = sampleMember(2, "user2", "유저2")
        val user3 = sampleMember(3, "user3", "유저3")

        given(memberUseCase.findByUsername("user1")).willReturn(user1)
        given(memberUseCase.findByUsername("user2")).willReturn(user2)
        given(memberUseCase.findByUsername("user3")).willReturn(user3)

        given(postRepository.existsByAuthorAndTitle(user1, "제목 1")).willReturn(true)
        given(postRepository.existsByAuthorAndTitle(user2, "제목 2")).willReturn(false)
        given(postRepository.existsByAuthorAndTitle(user3, "제목 3")).willReturn(false)
        given(postRepository.existsByAuthorAndTitle(user1, "비공개 글")).willReturn(true)

        fixture.makeBasePosts()

        then(postUseCase).should().write(user2, "제목 2", "내용 2", true, true)
        then(postUseCase).should().write(user3, "제목 3", "내용 3", true, true)
        then(postUseCase).should(never()).write(user1, "제목 1", "내용 1", true, true)
        then(postUseCase).should(never()).write(user1, "비공개 글", "비공개 내용", false, false)
    }

    private fun sampleMember(
        id: Long,
        username: String,
        nickname: String,
    ): Member = Member(id, username, null, nickname)
}
