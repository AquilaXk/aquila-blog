package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_WORKSPACE_PUBLISHED
import com.back.boundedContexts.post.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verifyNoInteractions
import java.time.Instant

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
        val missingLikesOnly =
            testPost(23L).also {
                it.hitCountAttr = PostAttr(13L, it, HIT_COUNT, 17)
            }
        val unrelatedPost = testPost(99L)
        val missingPosts = listOf(missingBoth, missingHitOnly, missingLikesOnly)
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
                PostAttr(24L, missingLikesOnly, LIKES_COUNT, 11),
                PostAttr(25L, missingLikesOnly, HIT_COUNT, 88),
                PostAttr(26L, missingBoth, "OTHER_ATTR", 1),
                PostAttr(27L, unrelatedPost, LIKES_COUNT, 50),
            ),
        )

        service.hydratePostAttrs(listOf(alreadyHydrated, missingBoth, missingHitOnly, missingLikesOnly))

        assertThat(alreadyHydrated.likesCount).isEqualTo(3)
        assertThat(alreadyHydrated.hitCount).isEqualTo(9)
        assertThat(missingBoth.likesCount).isEqualTo(4)
        assertThat(missingBoth.hitCount).isEqualTo(15)
        assertThat(missingHitOnly.likesCount).isEqualTo(8)
        assertThat(missingHitOnly.hitCount).isEqualTo(30)
        assertThat(missingLikesOnly.likesCount).isEqualTo(11)
        assertThat(missingLikesOnly.hitCount).isEqualTo(17)
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

    @Test
    @DisplayName("hydrateMembersPublishedProfileWorkspaces는 회원 ID 기준으로 프로필 워크스페이스를 매핑하고 활성 회원의 누락 시 예외를 던진다")
    fun hydratesMembersPublishedProfileWorkspacesByMemberId() {
        service.hydrateMembersPublishedProfileWorkspaces(emptyList())
        verifyNoInteractions(memberAttrRepository)

        val activeWithAttr = Member(id = 1L, username = "u1", nickname = "n1", apiKey = "k1")
        val deletedWithoutAttr =
            Member(id = 2L, username = "u2", nickname = "n2", apiKey = "k2").apply {
                deletedAt = Instant.parse("2026-01-01T00:00:00Z")
            }
        val deletedWithAttr =
            Member(id = 3L, username = "u3", nickname = "n3", apiKey = "k3").apply {
                deletedAt = Instant.parse("2026-01-01T00:00:00Z")
            }
        val attr1 = MemberAttr(101L, activeWithAttr, PROFILE_WORKSPACE_PUBLISHED, "{}")
        val attr3 = MemberAttr(103L, deletedWithAttr, PROFILE_WORKSPACE_PUBLISHED, "{}")
        given(
            memberAttrRepository.findBySubjectInAndNameIn(
                listOf(activeWithAttr, deletedWithoutAttr, deletedWithAttr),
                listOf(PROFILE_WORKSPACE_PUBLISHED),
            ),
        ).willReturn(listOf(attr1, attr3))

        service.hydrateMembersPublishedProfileWorkspaces(
            listOf(activeWithAttr, activeWithAttr, deletedWithoutAttr, deletedWithAttr),
        )

        assertThat(activeWithAttr.getProfileWorkspacePublishedAttr()).isSameAs(attr1)
        assertThat(deletedWithAttr.getProfileWorkspacePublishedAttr()).isSameAs(attr3)

        val activeMissingAttr = Member(id = 4L, username = "u4", nickname = "n4", apiKey = "k4")
        given(
            memberAttrRepository.findBySubjectInAndNameIn(
                listOf(activeMissingAttr),
                listOf(PROFILE_WORKSPACE_PUBLISHED),
            ),
        ).willReturn(emptyList())

        assertThatThrownBy {
            service.hydrateMembersPublishedProfileWorkspaces(listOf(activeMissingAttr))
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessage("profile workspace published is missing")
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
