package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verifyNoInteractions

@DisplayName("PostHydrationService 테스트")
class PostHydrationServiceTest {
    private val postAttrRepository: PostAttrRepositoryPort = mock(PostAttrRepositoryPort::class.java)
    private val memberAttrRepository: MemberAttrRepositoryPort = mock(MemberAttrRepositoryPort::class.java)
    private val service = PostHydrationService(postAttrRepository, memberAttrRepository)

    @Test
    @DisplayName("단건 hydratePostAttrs는 단건 2회 조회 대신 IN 배치 조회 1회로 카운터 속성을 채운다")
    fun hydrateSinglePostAttrsWithSingleBatchQuery() {
        val post = testPost(10L)
        val likesAttr = PostAttr(1L, post, LIKES_COUNT, 5)
        val hitAttr = PostAttr(2L, post, HIT_COUNT, 12)
        given(
            postAttrRepository.findBySubjectInAndNameIn(
                listOf(post),
                listOf(LIKES_COUNT, HIT_COUNT),
            ),
        ).willReturn(listOf(likesAttr, hitAttr))

        service.hydratePostAttrs(post)

        assertThat(post.likesCountAttr).isSameAs(likesAttr)
        assertThat(post.hitCountAttr).isSameAs(hitAttr)
        assertThat(post.likesCount).isEqualTo(5)
        assertThat(post.hitCount).isEqualTo(12)
        then(postAttrRepository).should().findBySubjectInAndNameIn(
            listOf(post),
            listOf(LIKES_COUNT, HIT_COUNT),
        )
        then(postAttrRepository).should(never()).findBySubjectAndName(
            any(Post::class.java) ?: post,
            anyString(),
        )
    }

    @Test
    @DisplayName("다건 hydratePostAttrs는 누락된 속성이 있는 게시글만 필터링하여 배치 조회한다")
    fun hydrateMultiPostAttrsFiltersAlreadyHydratedPosts() {
        val alreadyHydrated =
            testPost(20L).also {
                it.likesCountAttr = PostAttr(10L, it, LIKES_COUNT, 3)
                it.hitCountAttr = PostAttr(11L, it, HIT_COUNT, 9)
            }
        val missingBoth = testPost(21L)
        val missingHitOnly =
            testPost(22L).also {
                it.likesCountAttr = PostAttr(12L, it, LIKES_COUNT, 8)
            }
        val missingPosts = listOf(missingBoth, missingHitOnly)
        given(
            postAttrRepository.findBySubjectInAndNameIn(
                missingPosts,
                listOf(LIKES_COUNT, HIT_COUNT),
            ),
        ).willReturn(
            listOf(
                PostAttr(20L, missingBoth, LIKES_COUNT, 4),
                PostAttr(21L, missingBoth, HIT_COUNT, 15),
                PostAttr(22L, missingHitOnly, LIKES_COUNT, 99),
                PostAttr(23L, missingHitOnly, HIT_COUNT, 30),
            ),
        )

        service.hydratePostAttrs(listOf(alreadyHydrated, missingBoth, missingHitOnly))

        assertThat(alreadyHydrated.likesCount).isEqualTo(3)
        assertThat(alreadyHydrated.hitCount).isEqualTo(9)
        assertThat(missingBoth.likesCount).isEqualTo(4)
        assertThat(missingBoth.hitCount).isEqualTo(15)
        assertThat(missingHitOnly.likesCount).isEqualTo(8)
        assertThat(missingHitOnly.hitCount).isEqualTo(30)
        then(postAttrRepository).should().findBySubjectInAndNameIn(
            missingPosts,
            listOf(LIKES_COUNT, HIT_COUNT),
        )
    }

    @Test
    @DisplayName("이미 모든 카운터 속성이 채워진 게시글은 저장소를 조회하지 않는다")
    fun skipRepositoryQueryWhenAllPostAttrsAreAlreadyPopulated() {
        val first =
            testPost(30L).also {
                it.likesCountAttr = PostAttr(31L, it, LIKES_COUNT, 1)
                it.hitCountAttr = PostAttr(32L, it, HIT_COUNT, 2)
            }
        val second =
            testPost(31L).also {
                it.likesCountAttr = PostAttr(33L, it, LIKES_COUNT, 3)
                it.hitCountAttr = PostAttr(34L, it, HIT_COUNT, 4)
            }

        service.hydratePostAttrs(first)
        service.hydratePostAttrs(listOf(first, second))

        verifyNoInteractions(postAttrRepository)
    }

    private fun testPost(id: Long): Post =
        Post(
            id = id,
            author = Member(id = 1L, username = "author", nickname = "작성자", apiKey = "author-api-key"),
            title = "제목-$id",
            content = "본문-$id",
            published = true,
            listed = true,
        )
}
