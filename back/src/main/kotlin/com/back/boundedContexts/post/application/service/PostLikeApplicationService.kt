package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.boundedContexts.post.event.PostLikedEvent
import com.back.boundedContexts.post.event.PostUnlikedEvent
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class PostLikeApplicationService(
    private val postRepository: PostRepositoryPort,
    private val postLikeRepository: PostLikeRepositoryPort,
    private val postHydrationService: PostHydrationService,
    private val postCounterService: PostCounterService,
    private val postInteractionSideEffectQueue: PostInteractionSideEffectQueue,
) {
    @Transactional
    fun like(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult {
        val persistenceActor = actor.toPersistenceMember()
        postHydrationService.hydratePostAttrs(post)
        val insertedLikeId = postLikeRepository.insertIfAbsent(persistenceActor, post)

        if (insertedLikeId == null) {
            val existingLike = postLikeRepository.findByLikerAndPost(persistenceActor, post)
            if (existingLike != null) {
                postCounterService.ensureLikesCountLoaded(post)
                return PostLikeToggleResult(true, existingLike.id)
            }

            val recoveredLikeId = postLikeRepository.insertIfAbsent(persistenceActor, post)
            if (recoveredLikeId == null) {
                postCounterService.syncLikesCount(post)
                return PostLikeToggleResult(
                    isLiked = postLikeRepository.existsByLikerAndPost(persistenceActor, post),
                    likeId = 0L,
                )
            }

            postCounterService.incrementLikesCount(post)
            postRepository.flush()
            enqueueLiked(post, actor, recoveredLikeId)
            return PostLikeToggleResult(true, recoveredLikeId)
        }

        postCounterService.incrementLikesCount(post)
        postRepository.flush()
        enqueueLiked(post, actor, insertedLikeId)

        return PostLikeToggleResult(true, insertedLikeId)
    }

    @Transactional
    fun unlike(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult {
        val persistenceActor = actor.toPersistenceMember()
        postHydrationService.hydratePostAttrs(post)
        val existingLike = postLikeRepository.findByLikerAndPost(persistenceActor, post)
        val postAuthorId = post.author.id
        val existingLikeId = existingLike?.id
        val deletedCount = postLikeRepository.deleteByLikerAndPost(persistenceActor, post)
        if (deletedCount > 1) {
            postCounterService.syncLikesCount(post)
        } else if (deletedCount == 1) {
            postCounterService.decrementLikesCount(post)
        } else {
            postCounterService.ensureLikesCountLoaded(post)
        }
        postRepository.flush()

        if (deletedCount > 0 && existingLikeId != null) {
            postInteractionSideEffectQueue.enqueue(
                postId = post.id,
                recommendationAction = PostInteractionRecommendationSideEffect.REFRESH,
                domainEvent = PostUnlikedEvent(UUID.randomUUID(), post.id, postAuthorId, existingLikeId, MemberDto(actor)),
            )
        } else {
            postInteractionSideEffectQueue.enqueue(
                postId = post.id,
                recommendationAction = PostInteractionRecommendationSideEffect.REFRESH,
            )
        }

        return PostLikeToggleResult(false, existingLikeId ?: 0L)
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun reconcileLikeState(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult {
        val persistenceActor = actor.toPersistenceMember()
        postHydrationService.hydratePostAttrs(post)
        postCounterService.syncLikesCount(post)
        val existingLike = postLikeRepository.findByLikerAndPost(persistenceActor, post)
        return PostLikeToggleResult(
            isLiked = existingLike != null,
            likeId = existingLike?.id ?: 0L,
        )
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    fun readLikeSnapshot(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult {
        val persistenceActor = actor.toPersistenceMember()
        post.likesCount = postLikeRepository.countByPost(post).toInt()
        val existingLike = postLikeRepository.findByLikerAndPost(persistenceActor, post)
        return PostLikeToggleResult(
            isLiked = existingLike != null,
            likeId = existingLike?.id ?: 0L,
        )
    }

    fun isLiked(
        post: Post,
        liker: Member?,
    ): Boolean {
        if (liker == null) return false
        return postLikeRepository.existsByLikerAndPost(liker.toPersistenceMember(), post)
    }

    fun findLikedPostIds(
        liker: Member?,
        posts: List<Post>,
    ): Set<Long> {
        if (liker == null || posts.isEmpty()) return emptySet()
        return postLikeRepository
            .findByLikerAndPostIn(liker.toPersistenceMember(), posts)
            .map { it.post.id }
            .toSet()
    }

    private fun enqueueLiked(
        post: Post,
        actor: Member,
        likeId: Long,
    ) {
        postInteractionSideEffectQueue.enqueue(
            postId = post.id,
            recommendationAction = PostInteractionRecommendationSideEffect.REFRESH,
            domainEvent = PostLikedEvent(UUID.randomUUID(), post.id, post.author.id, likeId, MemberDto(actor)),
        )
    }
}
