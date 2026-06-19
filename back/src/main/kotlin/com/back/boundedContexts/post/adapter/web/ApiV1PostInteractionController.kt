package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostHitDedupUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
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
        val post = postUseCase.findById(id).getOrThrow()
        if (!rq.hasRole("ADMIN")) {
            post.checkActorCanRead(rq.actorOrNull)
        }
        if (postHitDedupUseCase.shouldCountHit(id, resolveHitViewerKey())) {
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
        val post = postUseCase.findById(id).getOrThrow()
        if (!rq.hasRole("ADMIN")) {
            post.checkActorCanRead(rq.actorOrNull)
        }
        val likeResult = postUseCase.like(post, rq.actor)
        return RsData(
            "200-1",
            "좋아요를 반영했습니다.",
            PostLikeToggleResBody(
                likeResult.isLiked,
                post.likesCount,
            ),
        )
    }

    @DeleteMapping("/{id}/like")
    @Transactional
    fun unlike(
        @PathVariable @Positive id: Long,
    ): RsData<PostLikeToggleResBody> {
        val post = postUseCase.findById(id).getOrThrow()
        if (!rq.hasRole("ADMIN")) {
            post.checkActorCanRead(rq.actorOrNull)
        }
        val likeResult = postUseCase.unlike(post, rq.actor)
        return RsData(
            "200-1",
            "좋아요 취소를 반영했습니다.",
            PostLikeToggleResBody(
                likeResult.isLiked,
                post.likesCount,
            ),
        )
    }

    private fun resolveHitViewerKey(): String =
        rq.actorOrNull
            ?.let { "member:${it.id}" }
            ?: "anon:${rq.clientIp}|${rq.userAgent}"
}
