package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.domain.Post
import org.springframework.stereotype.Service

@Service
class PostLikeApplicationService(
    private val postLikeRepository: PostLikeRepositoryPort,
) {
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
}
