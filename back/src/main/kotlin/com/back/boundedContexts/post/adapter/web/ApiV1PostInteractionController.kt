package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostHitDedupUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.domain.Post
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.rsData.RsData
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
        val post = findReadablePost(id)
        if (postHitDedupUseCase.shouldCountHit(id, resolveViewerKey())) {
            postUseCase.incrementHit(post)
        }
        return RsData(
            "200-1",
            "조회수를 반영했습니다.",
            PostHitResBody(post.hitCount),
        )
    }

    @PutMapping("/{id}/like")
    @Transactional
    fun like(
        @PathVariable @Positive id: Long,
    ): RsData<PostLikeToggleResBody> {
        val post = findReadablePost(id)
        val viewerKey = resolveViewerKey()
        if (postHitDedupUseCase.markLikedIfAbsent(id, viewerKey)) {
            runCatching { postUseCase.incrementLike(post) }
                .onFailure {
                    postHitDedupUseCase.unmarkLikedIfPresent(id, viewerKey)
                    throw it
                }
        }
        return RsData(
            "200-1",
            "좋아요를 반영했습니다.",
            PostLikeToggleResBody(
                liked = true,
                likesCount = post.likesCount,
            ),
        )
    }

    @DeleteMapping("/{id}/like")
    @Transactional
    fun unlike(
        @PathVariable @Positive id: Long,
    ): RsData<PostLikeToggleResBody> {
        val post = findReadablePost(id)
        val viewerKey = resolveViewerKey()
        if (postHitDedupUseCase.unmarkLikedIfPresent(id, viewerKey)) {
            runCatching { postUseCase.decrementLike(post) }
                .onFailure {
                    postHitDedupUseCase.markLikedIfAbsent(id, viewerKey)
                    throw it
                }
        }
        return RsData(
            "200-1",
            "좋아요 취소를 반영했습니다.",
            PostLikeToggleResBody(
                liked = false,
                likesCount = post.likesCount,
            ),
        )
    }

    private fun findReadablePost(id: Long): Post {
        val post = postUseCase.findById(id).getOrThrow()
        if (!rq.hasRole("ADMIN") && !post.canRead(rq.actorOrNull)) {
            throw AppException(ErrorCode.NOT_FOUND, "존재하지 않는 글입니다.")
        }
        return post
    }

    private fun resolveViewerKey(): String =
        rq.actorOrNull
            ?.let { "member:${it.id}" }
            ?: "anon:${rq.clientIp}|${rq.userAgent}"
}
