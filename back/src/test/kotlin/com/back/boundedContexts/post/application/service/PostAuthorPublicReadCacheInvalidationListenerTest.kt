package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.event.MemberPublicProfileChangedEvent
import org.assertj.core.api.Assertions.assertThatCode
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify

@DisplayName("PostAuthorPublicReadCacheInvalidationListener 테스트")
class PostAuthorPublicReadCacheInvalidationListenerTest {
    @Test
    fun `작성자 공개 표시 변경 이벤트는 공개 읽기 캐시를 축출한다`() {
        val invalidator = mock(PostReadCacheInvalidator::class.java)
        val listener = PostAuthorPublicReadCacheInvalidationListener(invalidator)

        listener.handle(event())

        verify(invalidator).invalidateAuthorRepresentation("author-representation")
    }

    @Test
    fun `작성자 공개 표시 캐시 축출 실패는 이벤트 처리 예외로 전파하지 않는다`() {
        val invalidator = mock(PostReadCacheInvalidator::class.java)
        doThrow(IllegalStateException("cache unavailable"))
            .`when`(invalidator)
            .invalidateAuthorRepresentation("author-representation")
        val listener = PostAuthorPublicReadCacheInvalidationListener(invalidator)

        assertThatCode {
            listener.handle(event())
        }.doesNotThrowAnyException()
    }

    private fun event(): MemberPublicProfileChangedEvent =
        MemberPublicProfileChangedEvent(
            memberId = 1L,
            previousNickname = "before",
            currentNickname = "after",
            previousProfileImgUrl = "https://example.com/before.png",
            currentProfileImgUrl = "https://example.com/after.png",
        )
}
