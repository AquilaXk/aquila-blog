package com.back.boundedContexts.post.domain.postMixin

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.PostLike

private const val LIKES_COUNT = "likesCount"
private const val LIKES_COUNT_DEFAULT_VALUE = 0

data class PostLikeToggleResult(val isLiked: Boolean, val likeId: Int)

interface PostHasLikes : PostAware {
    val likesCount: Int
        get() = post.likesCountAttr?.intValue ?: LIKES_COUNT_DEFAULT_VALUE

    private fun setLikesCount(value: Int) {
        val attr = post.likesCountAttr
            ?: Post.attrRepository.findBySubjectAndName(post, LIKES_COUNT)?.also { post.likesCountAttr = it }
            ?: PostAttr(0, post, LIKES_COUNT, value).also { post.likesCountAttr = it }
        attr.intValue = value
        Post.attrRepository.save(attr)
    }

    fun isLikedBy(liker: Member?): Boolean {
        if (liker == null) return false
        return Post.likeRepository.findByLikerAndPost(liker, post) != null
    }

    fun toggleLike(liker: Member): PostLikeToggleResult {
        val existingLike = Post.likeRepository.findByLikerAndPost(liker, post)
        return if (existingLike != null) {
            Post.likeRepository.delete(existingLike)
            setLikesCount(likesCount - 1)
            PostLikeToggleResult(false, existingLike.id)
        } else {
            val newLike = PostLike(0, liker, post)
            val savedLike = Post.likeRepository.save(newLike)
            setLikesCount(likesCount + 1)
            PostLikeToggleResult(true, savedLike.id)
        }
    }
}
