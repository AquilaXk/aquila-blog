package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostHitDedupUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.PostInteractionReadStateDto
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.rsData.RsData
import com.back.global.web.application.IpAddressNormalizer
import com.back.global.web.application.Rq
import com.back.standard.extensions.getOrThrow
import jakarta.validation.constraints.Positive
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/post/api/v1/posts")
class ApiV1PostInteractionController(
    private val postUseCase: PostUseCase,
    private val postHitDedupUseCase: PostHitDedupUseCase,
    private val rq: Rq,
) {
    @PostMapping("/{id}/hit")
    @Transactional
    fun incrementHit(
        @PathVariable @Positive id: Long,
    ): RsData<PostHitResBody> {
        val state = findReadableInteractionState(id)
        val hitCount =
            if (postHitDedupUseCase.shouldCountHit(id, resolveViewerKey())) {
                val post = postUseCase.findById(id).getOrThrow()
                postUseCase.incrementHit(post)
                post.hitCount
            } else {
                state.hitCount
            }
        return RsData(
            "200-1",
            "조회수를 반영했습니다.",
            PostHitResBody(hitCount),
        )
    }

    @PutMapping("/{id}/like")
    @Transactional
    fun like(
        @PathVariable @Positive id: Long,
    ): RsData<PostLikeToggleResBody> {
        val state = findReadableInteractionState(id)
        val viewerKey = resolveViewerKey()
        val likesCount =
            if (postHitDedupUseCase.markLikedIfAbsent(id, viewerKey)) {
                try {
                    val post = postUseCase.findById(id).getOrThrow()
                    postUseCase.incrementLike(post)
                    post.likesCount
                } catch (ex: Throwable) {
                    postHitDedupUseCase.unmarkLikedIfPresent(id, viewerKey)
                    throw ex
                }
            } else {
                state.likesCount
            }
        return RsData(
            "200-1",
            "좋아요를 반영했습니다.",
            PostLikeToggleResBody(
                liked = true,
                likesCount = likesCount,
            ),
        )
    }

    @DeleteMapping("/{id}/like")
    @Transactional
    fun unlike(
        @PathVariable @Positive id: Long,
    ): RsData<PostLikeToggleResBody> {
        val state = findReadableInteractionState(id)
        val viewerKey = resolveViewerKey()
        val likesCount =
            if (postHitDedupUseCase.unmarkLikedIfPresent(id, viewerKey)) {
                try {
                    val post = postUseCase.findById(id).getOrThrow()
                    postUseCase.decrementLike(post)
                    post.likesCount
                } catch (ex: Throwable) {
                    postHitDedupUseCase.markLikedIfAbsent(id, viewerKey)
                    throw ex
                }
            } else {
                state.likesCount
            }
        return RsData(
            "200-1",
            "좋아요 취소를 반영했습니다.",
            PostLikeToggleResBody(
                liked = false,
                likesCount = likesCount,
            ),
        )
    }

    private fun findReadableInteractionState(id: Long): PostInteractionReadStateDto {
        val state =
            postUseCase.findInteractionReadStateById(id)
                ?: throw AppException(ErrorCode.NOT_FOUND, "존재하지 않는 글입니다.")
        val canRead = state.published || rq.hasRole("ADMIN") || rq.actorOrNull?.id == state.authorId
        if (!canRead) {
            throw AppException(ErrorCode.NOT_FOUND, "존재하지 않는 글입니다.")
        }
        return state
    }

    private fun resolveViewerKey(): String =
        rq.actorOrNull
            ?.let { "member:${it.id}" }
            ?: run {
                val clientIp = rq.clientIp
                if (IpAddressNormalizer.normalize(clientIp) == null) {
                    ""
                } else {
                    "anon:${IpAddressNormalizer.normalizeRateLimitKey(clientIp)}"
                }
            }
}
