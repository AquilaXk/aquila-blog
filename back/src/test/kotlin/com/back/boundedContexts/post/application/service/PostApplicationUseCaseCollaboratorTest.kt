package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.post.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostCommentRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.POSTS_COUNT
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.domain.PostLike
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
import org.mockito.Mockito.never
import java.time.Instant
import java.util.Optional

@DisplayName("PostApplicationService collaborator 분리 테스트")
class PostApplicationUseCaseCollaboratorTest {
    init {
        AppConfig(
            siteBackUrl = "http://localhost:8080",
            siteFrontUrl = "http://localhost:3000",
        )
    }

    @Test
    @DisplayName("PostCounterService는 좋아요 수 재동기화와 member posts 음수 보정을 처리한다")
    fun postCounterServiceRepairsCounts() {
        // given
        val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
        val postAttrRepository: PostAttrRepositoryPort = mock(PostAttrRepositoryPort::class.java)
        val memberAttrRepository: MemberAttrRepositoryPort = mock(MemberAttrRepositoryPort::class.java)
        val postLikeRepository: PostLikeRepositoryPort = mock(PostLikeRepositoryPort::class.java)
        val service = PostCounterService(postRepository, postAttrRepository, memberAttrRepository, postLikeRepository)
        val post = testPost()
        val likesAttr = PostAttr(1, post, LIKES_COUNT, 0)
        val member = testMember()
        post.likesCountAttr = likesAttr
        given(postLikeRepository.countByPost(post)).willReturn(7)
        given(postAttrRepository.save(likesAttr)).willReturn(likesAttr)
        given(postAttrRepository.incrementIntValue(post, LIKES_COUNT, -1)).willReturn(-2)
        given(postAttrRepository.incrementIntValue(post, LIKES_COUNT, 2)).willReturn(0)
        given(memberAttrRepository.incrementIntValue(member, POSTS_COUNT, -1)).willReturn(-2)
        given(memberAttrRepository.incrementIntValue(member, POSTS_COUNT, 2)).willReturn(0)

        // when
        service.syncLikesCount(post)
        service.decrementLikesCount(post)
        service.decrementMemberPostsCount(member)

        // then
        assertThat(post.likesCount).isZero()
        assertThat(likesAttr.intValue).isZero()
        then(postAttrRepository).should().save(likesAttr)
        then(postAttrRepository).should().incrementIntValue(post, LIKES_COUNT, 2)
        then(memberAttrRepository).should().incrementIntValue(member, POSTS_COUNT, 2)
    }

    @Test
    @DisplayName("PostCounterService는 member posts 실제 개수로 신규 attr을 보정한다")
    fun postCounterServiceReconcilesMissingMemberAttr() {
        // given
        val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
        val postAttrRepository: PostAttrRepositoryPort = mock(PostAttrRepositoryPort::class.java)
        val memberAttrRepository: MemberAttrRepositoryPort = mock(MemberAttrRepositoryPort::class.java)
        val postLikeRepository: PostLikeRepositoryPort = mock(PostLikeRepositoryPort::class.java)
        val service = PostCounterService(postRepository, postAttrRepository, memberAttrRepository, postLikeRepository)
        val member = testMember()
        given(postRepository.countByAuthor(member)).willReturn(3)
        given(memberAttrRepository.findBySubjectAndName(member, POSTS_COUNT)).willReturn(null)
        given(memberAttrRepository.save(anyValue())).willAnswer { it.arguments[0] as MemberAttr }

        // when
        service.reconcileMemberPostsCount(member)

        // then
        assertThat(member.postsCountAttr?.intValue).isEqualTo(3)
        then(memberAttrRepository).should().save(member.postsCountAttr!!)
    }

    @Test
    @DisplayName("PostTempDraftService는 tracked temp 조회와 lock 경쟁 실패를 처리한다")
    fun postTempDraftServiceFindsTrackedTempAndRejectsLockContention() {
        // given
        val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
        val memberAttrRepository: MemberAttrRepositoryPort = mock(MemberAttrRepositoryPort::class.java)
        val service = PostTempDraftService(postRepository, memberAttrRepository)
        val author = testMember()
        val tempPost = testPost(author = author)
        val marker = MemberAttr(1, author, "activeTempDraftPostId", tempPost.id.toString())
        given(memberAttrRepository.findBySubjectAndName(author, "activeTempDraftPostId")).willReturn(marker)
        given(postRepository.findById(tempPost.id)).willReturn(Optional.of(tempPost))
        given(memberAttrRepository.incrementIntValue(author, "activeTempDraftLock", 1)).willReturn(2)

        // when
        val found = service.findTemp(author)

        // then
        assertThat(found).isSameAs(tempPost)
        assertThatThrownBy { service.getOrCreateTemp(author) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("다른 탭")
        then(memberAttrRepository).should().incrementIntValue(author, "activeTempDraftLock", -1)
    }

    @Test
    @DisplayName("PostLikeApplicationService는 insert 경쟁 복구 성공/실패와 중복 unlike 보정을 처리한다")
    fun postLikeApplicationServiceHandlesRaceRecoveryBranches() {
        // given
        val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
        val postLikeRepository: PostLikeRepositoryPort = mock(PostLikeRepositoryPort::class.java)
        val hydrationService: PostHydrationService = mock(PostHydrationService::class.java)
        val counterService: PostCounterService = mock(PostCounterService::class.java)
        val sideEffectQueue: PostInteractionSideEffectQueue = mock(PostInteractionSideEffectQueue::class.java)
        val service =
            PostLikeApplicationService(
                postRepository = postRepository,
                postLikeRepository = postLikeRepository,
                postHydrationService = hydrationService,
                postCounterService = counterService,
                postInteractionSideEffectQueue = sideEffectQueue,
            )
        val actor = testMember(id = 2)
        val post = testPost()
        given(postLikeRepository.insertIfAbsent(actor, post)).willReturn(null, 99)
        given(postLikeRepository.findByLikerAndPost(actor, post)).willReturn(null)

        // when
        val recovered = service.like(post, actor)

        // then
        assertThat(recovered.isLiked).isTrue()
        assertThat(recovered.likeId).isEqualTo(99)
        then(counterService).should().incrementLikesCount(post)
        then(postRepository).should().flush()

        // given
        val secondPost = testPost(id = 11)
        given(postLikeRepository.insertIfAbsent(actor, secondPost)).willReturn(null, null)
        given(postLikeRepository.findByLikerAndPost(actor, secondPost)).willReturn(null)
        given(postLikeRepository.existsByLikerAndPost(actor, secondPost)).willReturn(true)

        // when
        val failedRecovery = service.like(secondPost, actor)

        // then
        assertThat(failedRecovery.isLiked).isTrue()
        assertThat(failedRecovery.likeId).isZero()
        then(counterService).should().syncLikesCount(secondPost)

        // given
        val like = PostLike(55, actor, post)
        given(postLikeRepository.findByLikerAndPost(actor, post)).willReturn(like)
        given(postLikeRepository.deleteByLikerAndPost(actor, post)).willReturn(2)

        // when
        val unliked = service.unlike(post, actor)

        // then
        assertThat(unliked.isLiked).isFalse()
        assertThat(unliked.likeId).isEqualTo(55)
        then(counterService).should().syncLikesCount(post)
    }

    @Test
    @DisplayName("PostLikeApplicationService는 reconcile과 snapshot 조회를 별도 transaction 경로에서 반환한다")
    fun postLikeApplicationServiceReadsReconcileAndSnapshot() {
        // given
        val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
        val postLikeRepository: PostLikeRepositoryPort = mock(PostLikeRepositoryPort::class.java)
        val hydrationService: PostHydrationService = mock(PostHydrationService::class.java)
        val counterService: PostCounterService = mock(PostCounterService::class.java)
        val sideEffectQueue: PostInteractionSideEffectQueue = mock(PostInteractionSideEffectQueue::class.java)
        val service =
            PostLikeApplicationService(
                postRepository = postRepository,
                postLikeRepository = postLikeRepository,
                postHydrationService = hydrationService,
                postCounterService = counterService,
                postInteractionSideEffectQueue = sideEffectQueue,
            )
        val actor = testMember(id = 2)
        val post = testPost()
        val like = PostLike(77, actor, post)
        given(postLikeRepository.findByLikerAndPost(actor, post)).willReturn(like)
        given(postLikeRepository.countByPost(post)).willReturn(4)

        // when
        val reconciled = service.reconcileLikeState(post, actor)
        val snapshot = service.readLikeSnapshot(post, actor)

        // then
        assertThat(reconciled.likeId).isEqualTo(77)
        assertThat(snapshot.likeId).isEqualTo(77)
        assertThat(post.likesCount).isEqualTo(4)
        then(counterService).should().syncLikesCount(post)
    }

    @Test
    @DisplayName("PostHydrationService는 중복 member id 입력에도 모든 인스턴스에 profile image attr을 주입한다")
    fun postHydrationServiceHydratesEveryDuplicateMemberInstance() {
        // given
        val postAttrRepository: PostAttrRepositoryPort = mock(PostAttrRepositoryPort::class.java)
        val memberAttrRepository: MemberAttrRepositoryPort = mock(MemberAttrRepositoryPort::class.java)
        val service = PostHydrationService(postAttrRepository, memberAttrRepository)
        val first = testMember(id = 3)
        val second = testMember(id = 3)
        val persistedAttr = MemberAttr(1, first, PROFILE_IMG_URL, "https://example.com/profile.png")
        given(memberAttrRepository.findBySubjectInAndNameIn(listOf(first), listOf(PROFILE_IMG_URL)))
            .willReturn(listOf(persistedAttr))

        // when
        service.hydrateMembersProfileImgAttrs(listOf(first, second))

        // then
        assertThat(first.profileImgUrl).isEqualTo("https://example.com/profile.png")
        assertThat(second.profileImgUrl).isEqualTo("https://example.com/profile.png")
    }

    @Test
    @DisplayName("PostCommentApplicationService는 parentComment 생략 시 새 댓글을 저장한다")
    fun postCommentApplicationServiceWritesRootCommentWithDefaultParent() {
        // given
        val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
        val postCommentRepository: PostCommentRepositoryPort = mock(PostCommentRepositoryPort::class.java)
        val hydrationService: PostHydrationService = mock(PostHydrationService::class.java)
        val counterService: PostCounterService = mock(PostCounterService::class.java)
        val sideEffectQueue: PostInteractionSideEffectQueue = mock(PostInteractionSideEffectQueue::class.java)
        val service =
            PostCommentApplicationService(
                postRepository = postRepository,
                postCommentRepository = postCommentRepository,
                postHydrationService = hydrationService,
                postCounterService = counterService,
                postInteractionSideEffectQueue = sideEffectQueue,
            )
        val author = testMember(id = 2)
        val post = testPost()
        given(postCommentRepository.save(anyValue())).willAnswer {
            (it.arguments[0] as PostComment).also { comment ->
                val now = Instant.now()
                comment.createdAt = now
                comment.modifiedAt = now
            }
        }

        // when
        val comment = service.writeComment(author, post, "댓글")

        // then
        assertThat(comment.author.id).isEqualTo(author.id)
        assertThat(comment.content).isEqualTo("댓글")
        then(counterService).should().incrementCommentsCount(post)
        then(counterService).should().incrementMemberPostCommentsCount(author)
    }

    @Test
    @DisplayName("PostCommentApplicationService는 부모 댓글을 현재 게시글에서 찾지 못하면 저장하지 않는다")
    fun postCommentApplicationServiceRejectsMissingParentComment() {
        // given
        val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
        val postCommentRepository: PostCommentRepositoryPort = mock(PostCommentRepositoryPort::class.java)
        val hydrationService: PostHydrationService = mock(PostHydrationService::class.java)
        val counterService: PostCounterService = mock(PostCounterService::class.java)
        val sideEffectQueue: PostInteractionSideEffectQueue = mock(PostInteractionSideEffectQueue::class.java)
        val service =
            PostCommentApplicationService(
                postRepository = postRepository,
                postCommentRepository = postCommentRepository,
                postHydrationService = hydrationService,
                postCounterService = counterService,
                postInteractionSideEffectQueue = sideEffectQueue,
            )
        val author = testMember(id = 2)
        val post = testPost()
        val parentComment = PostComment(99, author, post, "부모 댓글")
        given(postCommentRepository.findByPostAndId(post, parentComment.id)).willReturn(null)

        // when / then
        assertThatThrownBy { service.writeComment(author, post, "대댓글", parentComment) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("부모 댓글을 찾을 수 없습니다.")
        then(postCommentRepository).should(never()).save(anyValue())
    }

    @Test
    @DisplayName("PostCommentApplicationService는 공개 댓글 삭제 시 도메인 이벤트를 큐에 넣는다")
    fun postCommentApplicationServiceDeletesCommentWithDomainEvent() {
        // given
        val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
        val postCommentRepository: PostCommentRepositoryPort = mock(PostCommentRepositoryPort::class.java)
        val hydrationService: PostHydrationService = mock(PostHydrationService::class.java)
        val counterService: PostCounterService = mock(PostCounterService::class.java)
        val sideEffectQueue: PostInteractionSideEffectQueue = mock(PostInteractionSideEffectQueue::class.java)
        val service =
            PostCommentApplicationService(
                postRepository = postRepository,
                postCommentRepository = postCommentRepository,
                postHydrationService = hydrationService,
                postCounterService = counterService,
                postInteractionSideEffectQueue = sideEffectQueue,
            )
        val author = testMember(id = 2)
        val post = testPost()
        val comment =
            PostComment(7, author, post, "삭제할 댓글").also {
                val now = Instant.now()
                it.createdAt = now
                it.modifiedAt = now
            }
        given(postCommentRepository.findActiveSubtreeByPostAndRootCommentId(post, comment.id))
            .willReturn(listOf(comment))

        // when
        service.deleteComment(post, comment, author)

        // then
        assertThat(comment.deletedAt).isNotNull()
        then(postRepository).should().flush()
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
