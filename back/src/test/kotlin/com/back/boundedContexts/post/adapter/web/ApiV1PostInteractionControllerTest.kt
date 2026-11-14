package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.input.PostHitDedupUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.domain.Post
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
import org.mockito.Mockito.verify

@DisplayName("ApiV1PostInteractionController 단위 테스트")
class ApiV1PostInteractionControllerTest {
    private val postUseCase = mock(PostUseCase::class.java)
    private val postHitDedupUseCase = mock(PostHitDedupUseCase::class.java)
    private val rq = mock(Rq::class.java)
    private val controller = ApiV1PostInteractionController(postUseCase, postHitDedupUseCase, rq)

    @Test
    @DisplayName("좋아요 반영 중 DB 증가가 실패하면 Redis 좋아요 상태를 보상 취소하고 예외를 재전파한다")
    fun likeCompensatesRedisStateWhenIncrementLikeFails() {
        val post = publicPost(id = 10L, likesCount = 3)
        given(postUseCase.findById(10L)).willReturn(post)
        given(rq.hasRole("ADMIN")).willReturn(false)
        given(rq.actorOrNull).willReturn(null)
        given(rq.clientIp).willReturn("203.0.113.50")
        val expectedViewerKey = "anon:203.0.113.50"
        given(postHitDedupUseCase.markLikedIfAbsent(10L, expectedViewerKey)).willReturn(true)
        val failure = IllegalStateException("db failure")
        doThrow(failure).`when`(postUseCase).incrementLike(post)

        assertThatThrownBy { controller.like(10L) }
            .isSameAs(failure)

        verify(postHitDedupUseCase).unmarkLikedIfPresent(10L, expectedViewerKey)
    }

    @Test
    @DisplayName("좋아요 취소 반영 중 DB 감소가 실패하면 Redis 좋아요 상태를 보상 복구하고 예외를 재전파한다")
    fun unlikeCompensatesRedisStateWhenDecrementLikeFails() {
        val actor = member(id = 7L)
        val post = publicPost(id = 11L, likesCount = 4)
        given(postUseCase.findById(11L)).willReturn(post)
        given(rq.hasRole("ADMIN")).willReturn(false)
        given(rq.actorOrNull).willReturn(actor)
        val expectedViewerKey = "member:7"
        given(postHitDedupUseCase.unmarkLikedIfPresent(11L, expectedViewerKey)).willReturn(true)
        val failure = IllegalStateException("db failure")
        doThrow(failure).`when`(postUseCase).decrementLike(post)

        assertThatThrownBy { controller.unlike(11L) }
            .isSameAs(failure)

        verify(postHitDedupUseCase).markLikedIfAbsent(11L, expectedViewerKey)
    }

    @Test
    @DisplayName("좋아요와 좋아요 취소 및 조회수는 dedup 결과에 따라 카운터 반영 여부를 결정한다")
    fun interactionsRespectDedupDecision() {
        val post = publicPost(id = 12L, likesCount = 2, hitCount = 5)
        given(postUseCase.findById(12L)).willReturn(post)
        given(rq.hasRole("ADMIN")).willReturn(true)
        given(rq.actorOrNull).willReturn(null)
        given(rq.clientIp).willReturn("203.0.113.51")
        val viewerKey = "anon:203.0.113.51"

        given(postHitDedupUseCase.shouldCountHit(12L, viewerKey)).willReturn(true, false)
        assertThat(controller.incrementHit(12L).data.hitCount).isEqualTo(5)
        assertThat(controller.incrementHit(12L).data.hitCount).isEqualTo(5)
        verify(postUseCase).incrementHit(post)

        given(postHitDedupUseCase.markLikedIfAbsent(12L, viewerKey)).willReturn(true, false)
        assertThat(controller.like(12L).data).isEqualTo(PostLikeToggleResBody(liked = true, likesCount = 2))
        assertThat(controller.like(12L).data).isEqualTo(PostLikeToggleResBody(liked = true, likesCount = 2))
        verify(postUseCase).incrementLike(post)
        verify(postHitDedupUseCase, never()).unmarkLikedIfPresent(12L, viewerKey)

        given(postHitDedupUseCase.unmarkLikedIfPresent(12L, viewerKey)).willReturn(true, false)
        assertThat(controller.unlike(12L).data).isEqualTo(PostLikeToggleResBody(liked = false, likesCount = 2))
        assertThat(controller.unlike(12L).data).isEqualTo(PostLikeToggleResBody(liked = false, likesCount = 2))
        verify(postUseCase).decrementLike(post)
    }

    @Test
    @DisplayName("익명 viewer key는 User-Agent 변조와 무관하게 정규화 IP와 IPv6 /64 프리픽스만 사용하고 잘못된 IP는 빈 키를 반환한다")
    fun anonymousViewerKeyIgnoresUserAgentNormalizesIpv6AndRejectsInvalidIp() {
        val post = publicPost(id = 14L, likesCount = 0, hitCount = 1)
        given(postUseCase.findById(14L)).willReturn(post)
        given(rq.hasRole("ADMIN")).willReturn(false)
        given(rq.actorOrNull).willReturn(null)
        given(rq.clientIp).willReturn("[2001:db8:1:2:aaaa::1]:443", "2001:db8:1:2:bbbb::9", "invalid-ip")
        given(rq.userAgent).willReturn("Agent-A", "Agent-B", "Agent-C")
        val normalizedIpv6Key = "anon:2001:db8:1:2::/64"
        given(postHitDedupUseCase.shouldCountHit(14L, normalizedIpv6Key)).willReturn(true, false)
        given(postHitDedupUseCase.shouldCountHit(14L, "")).willReturn(false)

        controller.incrementHit(14L)
        controller.incrementHit(14L)
        controller.incrementHit(14L)

        verify(postUseCase).incrementHit(post)
        verify(postHitDedupUseCase).shouldCountHit(14L, "")
    }

    @Test
    @DisplayName("비공개 글에 대해 읽기 권한이 없는 사용자의 상호작용 요청은 404 예외를 던진다")
    fun privatePostRejectsUnauthorizedViewer() {
        val privatePost =
            Post(
                id = 13L,
                author = member(id = 1L),
                title = "비공개",
                content = "내용",
                published = false,
                listed = false,
            )
        given(postUseCase.findById(13L)).willReturn(privatePost)
        given(rq.hasRole("ADMIN")).willReturn(false)
        given(rq.actorOrNull).willReturn(null)

        assertThatThrownBy { controller.like(13L) }
            .isInstanceOf(AppException::class.java)
            .extracting("errorCode")
            .isEqualTo(ErrorCode.NOT_FOUND)
    }

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
}
