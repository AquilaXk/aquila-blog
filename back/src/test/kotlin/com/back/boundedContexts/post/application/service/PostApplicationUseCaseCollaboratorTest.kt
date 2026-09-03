package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.post.application.port.output.MemberAttrRepositoryPort
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
        given(memberAttrRepository.incrementIntValue(member, POSTS_COUNT, -1)).willReturn(-2)
        given(memberAttrRepository.incrementIntValue(member, POSTS_COUNT, 2)).willReturn(0)

        service.syncLikesCount(post)
        service.decrementMemberPostsCount(member)

        assertThat(post.likesCount).isEqualTo(7)
        then(postAttrRepository).should().save(likesAttr)
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
        given(memberAttrRepository.save(anyValue())).willAnswer { it.arguments[0] as MemberAttr }

        service.reconcileMemberPostsCount(member)

        assertThat(member.postsCountAttr?.intValue).isEqualTo(3)
        then(memberAttrRepository).should().save(member.postsCountAttr!!)
    }

    @Test
    fun `temp draft lookup returns the tracked post and rejects lock contention`() {
        val postRepository = mock(PostRepositoryPort::class.java)
        val memberAttrRepository = mock(MemberAttrRepositoryPort::class.java)
        val service = PostTempDraftService(postRepository, memberAttrRepository)
        val author = testMember()
        val tempPost = testPost(author = author)
        val marker = MemberAttr(1, author, "activeTempDraftPostId", tempPost.id.toString())
        given(memberAttrRepository.findBySubjectAndName(author, "activeTempDraftPostId")).willReturn(marker)
        given(postRepository.findById(tempPost.id)).willReturn(Optional.of(tempPost))
        given(memberAttrRepository.incrementIntValue(author, "activeTempDraftLock", 1)).willReturn(2)

        assertThat(service.findTemp(author)).isSameAs(tempPost)
        assertThatThrownBy { service.getOrCreateTemp(author) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("다른 탭")
        then(memberAttrRepository).should().incrementIntValue(author, "activeTempDraftLock", -1)
    }

    @Test
    fun `temp draft lookup ignores an untracked legacy title and creates a marked post`() {
        val postRepository = mock(PostRepositoryPort::class.java)
        val memberAttrRepository = mock(MemberAttrRepositoryPort::class.java)
        val service = PostTempDraftService(postRepository, memberAttrRepository)
        val author = testMember()
        val untrackedLegacyPost = testPost(author = author)
        var savedMarker: MemberAttr? = null
        untrackedLegacyPost.title = "임시글"
        untrackedLegacyPost.published = false
        given(memberAttrRepository.findBySubjectAndName(author, "activeTempDraftPostId")).willReturn(null)
        given(memberAttrRepository.incrementIntValue(author, "activeTempDraftLock", 1)).willReturn(1)
        given(postRepository.save(anyValue())).willAnswer { it.arguments[0] as Post }
        given(memberAttrRepository.save(anyValue())).willAnswer {
            (it.arguments[0] as MemberAttr).also { marker -> savedMarker = marker }
        }

        assertThat(service.findTemp(author)).isNull()
        val (createdPost, created) = service.getOrCreateTemp(author)

        assertThat(created).isTrue()
        assertThat(createdPost).isNotSameAs(untrackedLegacyPost)
        assertThat(createdPost.title).isEqualTo("임시글")
        then(postRepository).should().save(createdPost)
        assertThat(savedMarker?.name).isEqualTo("activeTempDraftPostId")
        assertThat(savedMarker?.strValue).isEqualTo(createdPost.id.toString())
    }

    @Test
    fun `post hydration applies one persisted profile image to duplicate member instances`() {
        val postAttrRepository = mock(PostAttrRepositoryPort::class.java)
        val memberAttrRepository = mock(MemberAttrRepositoryPort::class.java)
        val service = PostHydrationService(postAttrRepository, memberAttrRepository)
        val first = testMember(id = 3)
        val second = testMember(id = 3)
        val persistedAttr = MemberAttr(1, first, PROFILE_IMG_URL, "https://example.com/profile.png")
        given(memberAttrRepository.findBySubjectInAndNameIn(listOf(first), listOf(PROFILE_IMG_URL)))
            .willReturn(listOf(persistedAttr))

        service.hydrateMembersProfileImgAttrs(listOf(first, second))

        assertThat(first.profileImgUrl).isEqualTo("https://example.com/profile.png")
        assertThat(second.profileImgUrl).isEqualTo("https://example.com/profile.png")
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

    @Suppress("UNCHECKED_CAST")
    private fun <T> anyValue(): T {
        any<T>()
        return null as T
    }
}
