package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import com.back.boundedContexts.post.domain.Post
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`

class PostSearchIndexSyncServiceTest {
    private val postUseCase = mock(PostUseCase::class.java)
    private val postTagIndexRepository = mock(PostTagIndexRepositoryPort::class.java)
    private val service = PostSearchIndexSyncService(postUseCase, postTagIndexRepository, 32)

    @Test
    fun `missing post는 tag fallback 없이 실패한다`() {
        `when`(postUseCase.findById(41L)).thenReturn(null)

        assertThatThrownBy {
            service.sync(postId = 41L, forceClear = false)
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("missing postId=41")
        verifyNoInteractions(postTagIndexRepository)
    }

    @Test
    fun `DB post에 tag가 없으면 빈 정본을 그대로 저장한다`() {
        `when`(postUseCase.findById(42L)).thenReturn(post(42L, "본문 without metadata"))

        service.sync(postId = 42L, forceClear = false)

        verify(postTagIndexRepository).replacePostTags(42L, emptyList())
    }

    private fun post(
        id: Long,
        content: String,
    ): Post =
        Post(
            id = id,
            author = Member(id = 1, username = "author", nickname = "작성자", apiKey = "api-key"),
            title = "title",
            content = content,
        )
}
