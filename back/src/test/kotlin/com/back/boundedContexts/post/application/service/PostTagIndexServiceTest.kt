package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import com.back.boundedContexts.post.domain.Post
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.BDDMockito.willThrow
import org.mockito.Mockito.mock

@DisplayName("PostTagIndexService 테스트")
class PostTagIndexServiceTest {
    private val postTagIndexRepository: PostTagIndexRepositoryPort = mock(PostTagIndexRepositoryPort::class.java)
    private val service = PostTagIndexService(postTagIndexRepository)

    @Test
    @DisplayName("공개 태그 집계는 매 요청 canonical repository 결과를 반환한다")
    fun loadPublicTagCountsFromCanonicalRepositoryOnEachRequest() {
        // given
        given(postTagIndexRepository.findAllPublicTagCounts())
            .willReturn(
                listOf(
                    PostTagIndexRepositoryPort.TagCountRow("spring", 3),
                    PostTagIndexRepositoryPort.TagCountRow("kotlin", 2),
                ),
            )

        // when
        val first = service.getPublicTagCounts()
        val second = service.getPublicTagCounts()

        // then
        assertThat(first.map { it.tag }).containsExactly("spring", "kotlin")
        assertThat(second.map { it.count }).containsExactly(3, 2)
        then(postTagIndexRepository).should(org.mockito.Mockito.times(2)).findAllPublicTagCounts()
    }

    @Test
    @DisplayName("집계 repository 실패는 legacy 조회 없이 전파한다")
    fun propagateCanonicalTagCountFailure() {
        // given
        val failure = RuntimeException("aggregate unavailable")
        given(postTagIndexRepository.findAllPublicTagCounts()).willThrow(failure)

        // then
        assertThat(assertThrows<RuntimeException> { service.getPublicTagCounts() }).isSameAs(failure)
    }

    @Test
    @DisplayName("본문 태그를 canonical 정규화 테이블에만 동기화한다")
    fun syncPostTagsToCanonicalIndexOnly() {
        // given
        val post = testPost(content = "tags: kotlin, spring, kotlin\n\n본문")

        // when
        service.syncPostTags(post)

        // then
        then(postTagIndexRepository).should().replacePostTags(post.id, listOf("kotlin", "spring"))
    }

    @Test
    @DisplayName("canonical replace 실패는 억제하지 않고 전파한다")
    fun propagateCanonicalTagWriteFailure() {
        // given
        val post = testPost(content = "tags: kotlin\n\n본문")
        val failure = RuntimeException("tag table unavailable")
        willThrow(failure).given(postTagIndexRepository).replacePostTags(post.id, listOf("kotlin"))

        // then
        assertThat(assertThrows<RuntimeException> { service.syncPostTags(post) }).isSameAs(failure)
    }

    private fun testPost(content: String): Post =
        Post(
            id = 10,
            author = Member(id = 1, username = "author", nickname = "작성자", apiKey = "author-api-key"),
            title = "제목",
            content = content,
            published = true,
            listed = true,
        )
}
