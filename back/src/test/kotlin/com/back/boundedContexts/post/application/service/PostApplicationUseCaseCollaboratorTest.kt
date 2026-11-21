package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.POSTS_COUNT
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.any
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.springframework.dao.PessimisticLockingFailureException
import java.time.Instant
import java.util.Optional

@DisplayName("Post application collaborator tests")
class PostApplicationUseCaseCollaboratorTest {
    init {
        AppConfig(
            siteBackUrl = "http://localhost:8080",
            siteFrontUrl = "http://localhost:3000",
        )
    }

    @Test
    fun `post counter synchronizes persisted likes and repairs negative member post counts`() {
        val postRepository = mock(PostRepositoryPort::class.java)
        val postAttrRepository = mock(PostAttrRepositoryPort::class.java)
        val memberAttrRepository = mock(MemberAttrRepositoryPort::class.java)
        val postLikeRepository = mock(PostLikeRepositoryPort::class.java)
        val service = PostCounterService(postRepository, postAttrRepository, memberAttrRepository, postLikeRepository)
        val post = testPost()
        val likesAttr = PostAttr(1, post, LIKES_COUNT, 0)
        val member = testMember()
        post.likesCountAttr = likesAttr
        given(postLikeRepository.countByPost(post)).willReturn(7)
        given(postAttrRepository.save(likesAttr)).willReturn(likesAttr)
        given(postAttrRepository.incrementIntValue(post, LIKES_COUNT, 1)).willReturn(8)
        given(postAttrRepository.incrementIntValue(post, LIKES_COUNT, -1)).willReturn(-1)
        given(memberAttrRepository.incrementIntValue(member, POSTS_COUNT, -1)).willReturn(-2)
        given(memberAttrRepository.incrementIntValue(member, POSTS_COUNT, 2)).willReturn(0)

        service.syncLikesCount(post)
        assertThat(post.likesCount).isEqualTo(7)

        service.incrementLike(post)
        assertThat(post.likesCount).isEqualTo(8)
        assertThat(likesAttr.intValue).isEqualTo(8)
        then(postRepository).should().updateLikesCount(post, 8, likesAttr)

        given(postLikeRepository.countByPost(post)).willReturn(2)
        service.syncLikesCount(post)
        assertThat(post.likesCount).isEqualTo(8)
        assertThat(likesAttr.intValue).isEqualTo(8)

        service.decrementLike(post)
        assertThat(post.likesCount).isEqualTo(0)
        assertThat(likesAttr.intValue).isEqualTo(0)
        then(postRepository).should().updateLikesCount(post, 0, likesAttr)

        service.decrementMemberPostsCount(member)

        then(postAttrRepository).should(times(2)).save(likesAttr)
        then(memberAttrRepository).should().incrementIntValue(member, POSTS_COUNT, 2)
    }

    @Test
    fun `post counter initializes a missing member post count from persisted posts`() {
        val postRepository = mock(PostRepositoryPort::class.java)
        val postAttrRepository = mock(PostAttrRepositoryPort::class.java)
        val memberAttrRepository = mock(MemberAttrRepositoryPort::class.java)
        val postLikeRepository = mock(PostLikeRepositoryPort::class.java)
        val service = PostCounterService(postRepository, postAttrRepository, memberAttrRepository, postLikeRepository)
        val member = testMember()
        given(postRepository.countByAuthor(member)).willReturn(3)
        given(memberAttrRepository.findBySubjectAndName(member, POSTS_COUNT)).willReturn(null)
        given(memberAttrRepository.save(anyMemberAttr())).willAnswer { it.arguments[0] as MemberAttr }

        service.reconcileMemberPostsCount(member)

        assertThat(member.postsCountAttr?.intValue).isEqualTo(3)
        then(memberAttrRepository).should().save(member.postsCountAttr!!)
    }

    @Test
    fun `temp draft lookup returns the tracked post and rejects lock contention`() {
        val postRepository = mock(PostRepositoryPort::class.java)
        val memberAttrRepository = mock(MemberAttrRepositoryPort::class.java)
        val postHydrationService = mock(PostHydrationService::class.java)
        val memberRepository = mock(MemberRepositoryPort::class.java)
        val service =
            PostTempDraftService(
                postRepository = postRepository,
                memberAttrRepository = memberAttrRepository,
                postHydrationService = postHydrationService,
                memberRepository = memberRepository,
            )
        val author = testMember()
        val tempPost = testPost(author = author)
        val marker = MemberAttr(1, author, "activeTempDraftPostId", tempPost.id.toString())
        given(memberAttrRepository.findBySubjectAndName(author, "activeTempDraftPostId")).willReturn(marker)
        given(postRepository.findById(tempPost.id)).willReturn(Optional.of(tempPost))
        given(memberRepository.findByIdForUpdate(author.id))
            .willThrow(PessimisticLockingFailureException("lock contention"))

        assertThat(service.findTemp(author)).isSameAs(tempPost)
        assertThatThrownBy { service.getOrCreateTemp(author) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("다른 탭")
    }

    @Test
    fun `temp draft lookup ignores an untracked legacy title and creates a marked post`() {
        val postRepository = mock(PostRepositoryPort::class.java)
        val memberAttrRepository = mock(MemberAttrRepositoryPort::class.java)
        val postHydrationService = mock(PostHydrationService::class.java)
        val postCounterService = mock(PostCounterService::class.java)
        val memberRepository = mock(MemberRepositoryPort::class.java)
        val service =
            PostTempDraftService(
                postRepository = postRepository,
                memberAttrRepository = memberAttrRepository,
                postHydrationService = postHydrationService,
                postCounterService = postCounterService,
                memberRepository = memberRepository,
            )
        val author = testMember()
        val untrackedLegacyPost = testPost(author = author)
        var savedMarker: MemberAttr? = null
        untrackedLegacyPost.title = "임시글"
        untrackedLegacyPost.published = false
        given(memberRepository.findByIdForUpdate(author.id)).willReturn(Optional.of(author))
        given(memberAttrRepository.findBySubjectAndName(author, "activeTempDraftPostId")).willReturn(null)
        given(postRepository.save(anyPost())).willAnswer { it.arguments[0] as Post }
        given(memberAttrRepository.save(anyMemberAttr())).willAnswer {
            (it.arguments[0] as MemberAttr).also { marker -> savedMarker = marker }
        }

        assertThat(service.findTemp(author)).isNull()
        val (createdPost, created) = service.getOrCreateTemp(author)

        assertThat(created).isTrue()
        assertThat(createdPost).isNotSameAs(untrackedLegacyPost)
        assertThat(createdPost.title).isEqualTo("임시글")
        val marker = requireNotNull(savedMarker)
        then(memberRepository).should().findByIdForUpdate(author.id)
        then(postRepository).should().save(createdPost)
        then(postRepository).should().flush()
        then(postRepository).shouldHaveNoMoreInteractions()
        then(postCounterService).should().incrementMemberPostsCount(author)
        then(memberAttrRepository).should(times(3)).findBySubjectAndName(author, "activeTempDraftPostId")
        then(memberAttrRepository).should().save(marker)
        assertThat(marker.name).isEqualTo("activeTempDraftPostId")
        assertThat(marker.strValue).isEqualTo(createdPost.id.toString())
    }

    @Test
    fun `getOrCreateTemp reconciles existing tracked post when isTempDraft is false`() {
        val postRepository = mock(PostRepositoryPort::class.java)
        val memberAttrRepository = mock(MemberAttrRepositoryPort::class.java)
        val postHydrationService = mock(PostHydrationService::class.java)
        val memberRepository = mock(MemberRepositoryPort::class.java)
        val service =
            PostTempDraftService(
                postRepository = postRepository,
                memberAttrRepository = memberAttrRepository,
                postHydrationService = postHydrationService,
                memberRepository = memberRepository,
            )
        val author = testMember()
        val existingPost = testPost(author = author)
        existingPost.isTempDraft = false
        val marker = MemberAttr(1, author, "activeTempDraftPostId", existingPost.id.toString())
        given(memberRepository.findByIdForUpdate(author.id)).willReturn(Optional.of(author))
        given(memberAttrRepository.findBySubjectAndName(author, "activeTempDraftPostId")).willReturn(marker)
        given(postRepository.findById(existingPost.id)).willReturn(Optional.of(existingPost))
        given(postRepository.save(anyPost())).willAnswer { it.arguments[0] as Post }

        val (post, created) = service.getOrCreateTemp(author)

        assertThat(created).isFalse()
        assertThat(post).isSameAs(existingPost)
        assertThat(post.isTempDraft).isTrue()
        then(memberRepository).should().findByIdForUpdate(author.id)
        then(postRepository).should().save(existingPost)
        then(postRepository).should().flush()
    }

    @Test
    fun `resolveTempDraftPostIds batches member attr lookup once for non-flag posts and handles edge cases`() {
        val postRepository = mock(PostRepositoryPort::class.java)
        val memberAttrRepository = mock(MemberAttrRepositoryPort::class.java)
        val postHydrationService = mock(PostHydrationService::class.java)
        val service = PostTempDraftService(postRepository, memberAttrRepository, postHydrationService)

        assertThat(service.resolveTempDraftPostIds(emptyList())).isEmpty()
        org.mockito.Mockito.verifyNoInteractions(memberAttrRepository)

        val author1 = testMember(1L)
        val flaggedOnlyPost = testPost(id = 100L, author = author1).apply { isTempDraft = true }
        assertThat(service.resolveTempDraftPostIds(listOf(flaggedOnlyPost))).containsExactly(100L)
        org.mockito.Mockito.verifyNoInteractions(memberAttrRepository)

        val author2 = testMember(2L)
        val author3 = testMember(3L)
        val author4 = testMember(4L)
        val author5 = testMember(5L)

        val trackedPost = testPost(id = 201L, author = author2)
        val unmatchedAuthor2Post = testPost(id = 202L, author = author2)
        val blankAttrPost = testPost(id = 301L, author = author3)
        val invalidAttrPost = testPost(id = 401L, author = author4)
        val differentTargetPost = testPost(id = 501L, author = author5)

        given(
            memberAttrRepository.findBySubjectInAndNameIn(
                listOf(author2, author3, author4, author5),
                listOf("activeTempDraftPostId"),
            ),
        ).willReturn(
            listOf(
                MemberAttr(1L, author2, "activeTempDraftPostId", " 201 "),
                MemberAttr(2L, author3, "activeTempDraftPostId", "   "),
                MemberAttr(3L, author4, "activeTempDraftPostId", "not-a-number"),
                MemberAttr(4L, author5, "activeTempDraftPostId", "999"),
            ),
        )

        val resolved =
            service.resolveTempDraftPostIds(
                listOf(flaggedOnlyPost, trackedPost, unmatchedAuthor2Post, blankAttrPost, invalidAttrPost, differentTargetPost),
            )

        assertThat(resolved).containsExactlyInAnyOrder(100L, 201L)
        then(memberAttrRepository).should(times(1)).findBySubjectInAndNameIn(
            listOf(author2, author3, author4, author5),
            listOf("activeTempDraftPostId"),
        )
        then(memberAttrRepository).should(org.mockito.Mockito.never()).findBySubjectAndName(author2, "activeTempDraftPostId")
    }

    private fun testMember(id: Long = 1): Member =
        Member(id = id, username = "user-$id", nickname = "작성자$id", apiKey = "api-key-$id").also {
            val now = Instant.now()
            it.createdAt = now
            it.modifiedAt = now
        }

    private fun testPost(
        id: Long = 10,
        author: Member = testMember(),
    ): Post =
        Post(
            id = id,
            author = author,
            title = "제목$id",
            content = "본문$id",
            published = true,
            listed = true,
        ).also {
            val now = Instant.now()
            it.createdAt = now
            it.modifiedAt = now
        }

    private fun anyPost(): Post = any(Post::class.java) ?: testPost()

    private fun anyMemberAttr(): MemberAttr = any(MemberAttr::class.java) ?: MemberAttr(1, testMember(), POSTS_COUNT, 0)
}
