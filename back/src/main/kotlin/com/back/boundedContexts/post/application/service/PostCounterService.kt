package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.post.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.POSTS_COUNT
import com.back.boundedContexts.post.domain.POST_COMMENTS_COUNT
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.COMMENTS_COUNT
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import org.springframework.stereotype.Service

@Service
class PostCounterService(
    private val postRepository: PostRepositoryPort,
    private val postAttrRepository: PostAttrRepositoryPort,
    private val memberAttrRepository: MemberAttrRepositoryPort,
    private val postLikeRepository: PostLikeRepositoryPort,
) {
    fun incrementHit(post: Post) {
        val updatedHitCount = postAttrRepository.incrementIntValue(post, HIT_COUNT)
        val refreshedAttr = post.hitCountAttr ?: postAttrRepository.findBySubjectAndName(post, HIT_COUNT)
        refreshedAttr?.let {
            it.intValue = updatedHitCount
            post.hitCountAttr = it
        }
    }

    fun syncLikesCount(post: Post) {
        val actualLikesCount = postLikeRepository.countByPost(post).toInt()
        post.likesCount = actualLikesCount
        savePostAttr(post.likesCountAttr)
    }

    fun ensureLikesCountLoaded(post: Post) {
        post.likesCountAttr = postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)
    }

    fun incrementLikesCount(post: Post) {
        val updatedLikesCount = postAttrRepository.incrementIntValue(post, LIKES_COUNT)
        applyLikesCount(post, updatedLikesCount)
    }

    fun decrementLikesCount(post: Post) {
        var updatedLikesCount = postAttrRepository.incrementIntValue(post, LIKES_COUNT, -1)
        if (updatedLikesCount < 0) {
            updatedLikesCount = postAttrRepository.incrementIntValue(post, LIKES_COUNT, -updatedLikesCount)
        }
        applyLikesCount(post, updatedLikesCount)
    }

    fun incrementCommentsCount(post: Post) {
        val updatedCommentsCount = postAttrRepository.incrementIntValue(post, COMMENTS_COUNT)
        applyCommentsCount(post, updatedCommentsCount)
    }

    fun incrementMemberPostCommentsCount(member: Member) {
        val updatedCount = memberAttrRepository.incrementIntValue(member, POST_COMMENTS_COUNT)
        val refreshedAttr = member.postCommentsCountAttr ?: memberAttrRepository.findBySubjectAndName(member, POST_COMMENTS_COUNT)
        refreshedAttr?.let {
            it.intValue = updatedCount
            member.postCommentsCountAttr = it
        }
    }

    fun incrementMemberPostsCount(member: Member) {
        val updatedCount = memberAttrRepository.incrementIntValue(member, POSTS_COUNT)
        member.postsCountAttr?.intValue = updatedCount
    }

    fun decrementMemberPostsCount(member: Member) {
        var updatedCount = memberAttrRepository.incrementIntValue(member, POSTS_COUNT, -1)
        if (updatedCount < 0) {
            updatedCount = memberAttrRepository.incrementIntValue(member, POSTS_COUNT, -updatedCount)
        }
        member.postsCountAttr?.intValue = updatedCount
    }

    fun reconcileMemberPostsCount(member: Member) {
        val actualCount = postRepository.countByAuthor(member).coerceAtLeast(0).toInt()
        val refreshedAttr = member.postsCountAttr ?: memberAttrRepository.findBySubjectAndName(member, POSTS_COUNT)
        val counterAttr = refreshedAttr ?: MemberAttr(0, member, POSTS_COUNT, actualCount)
        counterAttr.intValue = actualCount
        member.postsCountAttr = counterAttr
        saveMemberAttr(counterAttr)
    }

    fun savePostAttr(attr: PostAttr?) {
        attr?.let(postAttrRepository::save)
    }

    fun saveMemberAttr(attr: MemberAttr?) {
        attr?.let(memberAttrRepository::save)
    }

    private fun applyLikesCount(
        post: Post,
        likesCount: Int,
    ) {
        val refreshedAttr = post.likesCountAttr ?: postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)
        refreshedAttr?.let {
            it.intValue = likesCount
            post.likesCountAttr = it
        }
    }

    private fun applyCommentsCount(
        post: Post,
        commentsCount: Int,
    ) {
        val refreshedAttr = post.commentsCountAttr ?: postAttrRepository.findBySubjectAndName(post, COMMENTS_COUNT)
        refreshedAttr?.let {
            it.intValue = commentsCount
            post.commentsCountAttr = it
        }
    }
}
