package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.input.PostHitDedupUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.PostInteractionReadStateDto
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.web.application.Rq
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.transaction.annotation.Transactional

@DisplayName("ApiV1PostInteractionController 단위 테스트")
class ApiV1PostInteractionControllerTest {
    private val postUseCase = mock(PostUseCase::class.java)
    private val postHitDedupUseCase = mock(PostHitDedupUseCase::class.java)
    private val rq = mock(Rq::class.java)
    private val controller = ApiV1PostInteractionController(postUseCase, postHitDedupUseCase, rq)

    @Test
    @DisplayName("익명 좋아요 반영 중 DB 증가가 실패하면 Redis 좋아요 상태를 보상 취소하고 예외를 재전파한다")
    fun likeCompensatesRedisStateWhenIncrementLikeFails() {
        given(postUseCase.findInteractionReadStateById(10L)).willReturn(publicState(id = 10L, likesCount = 3))
        given(rq.actorOrNull).willReturn(null)
        given(rq.clientIp).willReturn("203.0.113.50")
        val expectedViewerKey = "anon:203.0.113.50"
        given(postHitDedupUseCase.markLikedIfAbsent(10L, expectedViewerKey)).willReturn(true)
        val failure = IllegalStateException("db failure")
        doThrow(failure).`when`(postUseCase).incrementLike(10L)

        assertThatThrownBy { controller.like(10L) }
            .isSameAs(failure)

        verify(postHitDedupUseCase).unmarkLikedIfPresent(10L, expectedViewerKey)
        verify(postUseCase, never()).findById(10L)
    }

    @Test
    @DisplayName("익명 좋아요 취소 반영 중 DB 감소가 실패하면 Redis 좋아요 상태를 보상 복구하고 예외를 재전파한다")
    fun unlikeCompensatesRedisStateWhenDecrementLikeFails() {
        given(postUseCase.findInteractionReadStateById(11L)).willReturn(publicState(id = 11L, likesCount = 4))
        given(rq.actorOrNull).willReturn(null)
        given(rq.clientIp).willReturn("203.0.113.51")
        val expectedViewerKey = "anon:203.0.113.51"
        given(postHitDedupUseCase.unmarkLikedIfPresent(11L, expectedViewerKey)).willReturn(true)
        val failure = IllegalStateException("db failure")
        doThrow(failure).`when`(postUseCase).decrementLike(11L)

        assertThatThrownBy { controller.unlike(11L) }
            .isSameAs(failure)

        verify(postHitDedupUseCase).markLikedIfAbsent(11L, expectedViewerKey)
        verify(postUseCase, never()).findById(11L)
    }

    @Test
    @DisplayName("인증 회원 좋아요와 좋아요 취소는 Redis TTL과 무관하게 PostLike 영속 경로를 사용한다")
    fun memberLikeAndUnlikeUseDurablePostLikePath() {
        val actor = member(id = 7L)
        given(postUseCase.findInteractionReadStateById(16L)).willReturn(publicState(id = 16L, likesCount = 4))
        given(rq.actorOrNull).willReturn(actor)
        given(postUseCase.likePost(16L, 7L)).willReturn(5)
        given(postUseCase.unlikePost(16L, 7L)).willReturn(4)

        assertThat(controller.like(16L).data).isEqualTo(PostLikeToggleResBody(liked = true, likesCount = 5))
        assertThat(controller.unlike(16L).data).isEqualTo(PostLikeToggleResBody(liked = false, likesCount = 4))

        verify(postUseCase).likePost(16L, 7L)
        verify(postUseCase).unlikePost(16L, 7L)
        verifyNoInteractions(postHitDedupUseCase)
        verify(postUseCase, never()).findById(16L)
    }

    @Test
    @DisplayName("회원 및 익명 다중 좋아요 취소는 팬텀 +1 복원 없이 0으로 수렴한다")
    fun sequentialMemberAndAnonymousUnlikesConvergeToZeroWithoutPhantomRestore() {
        val actor = member(id = 7L)
        given(postUseCase.findInteractionReadStateById(17L)).willReturn(
            publicState(id = 17L, likesCount = 2),
            publicState(id = 17L, likesCount = 1),
            publicState(id = 17L, likesCount = 0),
        )
        given(rq.actorOrNull).willReturn(actor, null, null)
        given(rq.clientIp).willReturn("203.0.113.61")
        given(postUseCase.unlikePost(17L, 7L)).willReturn(1)
        given(postHitDedupUseCase.unmarkLikedIfPresent(17L, "anon:203.0.113.61")).willReturn(true, false)
        given(postUseCase.decrementLike(17L)).willReturn(0)

        assertThat(controller.unlike(17L).data).isEqualTo(PostLikeToggleResBody(liked = false, likesCount = 1))
        assertThat(controller.unlike(17L).data).isEqualTo(PostLikeToggleResBody(liked = false, likesCount = 0))
        assertThat(controller.unlike(17L).data).isEqualTo(PostLikeToggleResBody(liked = false, likesCount = 0))

        verify(postUseCase, times(1)).unlikePost(17L, 7L)
        verify(postUseCase, times(1)).decrementLike(17L)
        verify(postUseCase, never()).incrementLike(17L)
    }

    @Test
    @DisplayName("좋아요와 좋아요 취소 및 조회수는 dedup 결과에 따라 경량 카운터 반영 여부를 결정한다")
    fun interactionsRespectDedupDecision() {
        given(postUseCase.findInteractionReadStateById(12L)).willReturn(publicState(id = 12L, likesCount = 2, hitCount = 5))
        given(postUseCase.incrementHit(12L)).willReturn(6)
        given(postUseCase.incrementLike(12L)).willReturn(3)
        given(postUseCase.decrementLike(12L)).willReturn(2)
        given(rq.actorOrNull).willReturn(null)
        given(rq.clientIp).willReturn("203.0.113.51")
        val viewerKey = "anon:203.0.113.51"

        given(postHitDedupUseCase.shouldCountHit(12L, viewerKey)).willReturn(true, false)
        assertThat(controller.incrementHit(12L).data.hitCount).isEqualTo(6)
        assertThat(controller.incrementHit(12L).data.hitCount).isEqualTo(5)
        verify(postUseCase).incrementHit(12L)

        given(postHitDedupUseCase.markLikedIfAbsent(12L, viewerKey)).willReturn(true, false)
        assertThat(controller.like(12L).data).isEqualTo(PostLikeToggleResBody(liked = true, likesCount = 3))
        assertThat(controller.like(12L).data).isEqualTo(PostLikeToggleResBody(liked = true, likesCount = 2))
        verify(postUseCase).incrementLike(12L)
        verify(postHitDedupUseCase, never()).unmarkLikedIfPresent(12L, viewerKey)

        given(postHitDedupUseCase.unmarkLikedIfPresent(12L, viewerKey)).willReturn(true, false)
        assertThat(controller.unlike(12L).data).isEqualTo(PostLikeToggleResBody(liked = false, likesCount = 2))
        assertThat(controller.unlike(12L).data).isEqualTo(PostLikeToggleResBody(liked = false, likesCount = 2))
        verify(postUseCase).decrementLike(12L)
        verify(postUseCase, never()).findById(12L)
    }

    @Test
    @DisplayName("익명 viewer key는 User-Agent 변조와 무관하게 정규화 IP와 IPv6 /64 프리픽스만 사용하고 잘못된 IP는 빈 키를 반환한다")
    fun anonymousViewerKeyIgnoresUserAgentNormalizesIpv6AndRejectsInvalidIp() {
        given(postUseCase.findInteractionReadStateById(14L)).willReturn(publicState(id = 14L, likesCount = 0, hitCount = 1))
        given(postUseCase.incrementHit(14L)).willReturn(2)
        given(rq.actorOrNull).willReturn(null)
        given(rq.clientIp).willReturn("[2001:db8:1:2:aaaa::1]:443", "2001:db8:1:2:bbbb::9", "invalid-ip")
        given(rq.userAgent).willReturn("Agent-A", "Agent-B", "Agent-C")
        val normalizedIpv6Key = "anon:2001:db8:1:2::/64"
        given(postHitDedupUseCase.shouldCountHit(14L, normalizedIpv6Key)).willReturn(true, false)
        given(postHitDedupUseCase.shouldCountHit(14L, "")).willReturn(false)

        controller.incrementHit(14L)
        controller.incrementHit(14L)
        controller.incrementHit(14L)

        verify(postUseCase).incrementHit(14L)
        verify(postUseCase, never()).findById(14L)
        verify(postHitDedupUseCase).shouldCountHit(14L, "")
    }

    @Test
    @DisplayName("비공개 글에 대해 읽기 권한이 없는 사용자와 미존재 글 요청은 엔티티 로드 없이 404 예외를 던진다")
    fun privatePostRejectsUnauthorizedViewer() {
        given(postUseCase.findInteractionReadStateById(13L)).willReturn(
            PostInteractionReadStateDto(id = 13L, authorId = 1L, published = false, hitCount = 0, likesCount = 0),
        )
        given(rq.hasRole("ADMIN")).willReturn(false)
        given(rq.actorOrNull).willReturn(null, member(id = 2L))

        assertThatThrownBy { controller.like(13L) }
            .isInstanceOf(AppException::class.java)
            .extracting("errorCode")
            .isEqualTo(ErrorCode.NOT_FOUND)
        assertThatThrownBy { controller.like(13L) }
            .isInstanceOf(AppException::class.java)
            .extracting("errorCode")
            .isEqualTo(ErrorCode.NOT_FOUND)

        given(postUseCase.findInteractionReadStateById(999L)).willReturn(null)
        assertThatThrownBy { controller.incrementHit(999L) }
            .isInstanceOf(AppException::class.java)
            .extracting("errorCode")
            .isEqualTo(ErrorCode.NOT_FOUND)

        verify(postUseCase, never()).findById(13L)
        verify(postUseCase, never()).findById(999L)
        verifyNoInteractions(postHitDedupUseCase)
    }

    @Test
    @DisplayName("비공개 글이라도 관리자 또는 작성자는 경량 상태 검증 후 상호작용을 수행할 수 있다")
    fun privatePostAllowsAuthorAndAdmin() {
        val author = member(id = 1L)
        val privatePost = publicPost(id = 15L, hitCount = 2).apply { published = false }
        given(postUseCase.findInteractionReadStateById(15L)).willReturn(
            PostInteractionReadStateDto(id = 15L, authorId = 1L, published = false, hitCount = 2, likesCount = 0),
        )
        given(postUseCase.findById(15L)).willReturn(privatePost)
        given(rq.hasRole("ADMIN")).willReturn(false, true)
        given(rq.actorOrNull).willReturn(author, author, null)
        given(rq.clientIp).willReturn("203.0.113.55")
        given(postHitDedupUseCase.shouldCountHit(15L, "member:1")).willReturn(false)
        given(postHitDedupUseCase.shouldCountHit(15L, "anon:203.0.113.55")).willReturn(false)

        assertThat(controller.incrementHit(15L).data.hitCount).isEqualTo(2)
        assertThat(controller.incrementHit(15L).data.hitCount).isEqualTo(2)
        verify(postUseCase, never()).findById(15L)
    }

    private fun publicState(
        id: Long,
        likesCount: Int = 0,
        hitCount: Int = 0,
    ): PostInteractionReadStateDto =
        PostInteractionReadStateDto(
            id = id,
            authorId = 1L,
            published = true,
            hitCount = hitCount,
            likesCount = likesCount,
        )

    private fun member(id: Long): Member =
        Member(
            id = id,
            username = "member-$id",
            password = "Password1234!",
            nickname = "작성자$id",
            email = "member-$id@example.com",
            apiKey = "api-key-$id",
        )

    private fun publicPost(
        id: Long,
        likesCount: Int = 0,
        hitCount: Int = 0,
    ): Post =
        Post(
            id = id,
            author = member(id = 1L),
            title = "공개 글",
            content = "내용",
            published = true,
            listed = true,
        ).also {
            it.likesCount = likesCount
            it.hitCount = hitCount
        }

    @Test
    @DisplayName("상호작용 컨트롤러와 공개 상세 컨트롤러 getItem은 컨트롤러 레벨 @Transactional을 선언하지 않는다")
    fun interactionAndPublicDetailControllersDoNotDeclareTransactional() {
        val interactionMethods =
            ApiV1PostInteractionController::class.java.declaredMethods.filter {
                it.name == "incrementHit" || it.name == "like" || it.name == "unlike"
            }
        assertThat(interactionMethods).hasSize(3)
        interactionMethods.forEach { method ->
            assertThat(method.isAnnotationPresent(Transactional::class.java))
                .withFailMessage("Controller method %s must not declare @Transactional", method.name)
                .isFalse()
        }

        val getItemMethod =
            ApiV1PostPublicReadController::class.java.declaredMethods.single { it.name == "getItem" }
        assertThat(getItemMethod.isAnnotationPresent(Transactional::class.java)).isFalse()
    }
}
