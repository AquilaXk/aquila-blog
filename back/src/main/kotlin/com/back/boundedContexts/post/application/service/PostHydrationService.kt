package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.post.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import org.springframework.stereotype.Service

@Service
class PostHydrationService(
    private val postAttrRepository: PostAttrRepositoryPort,
    private val memberAttrRepository: MemberAttrRepositoryPort,
) {
    fun hydratePostAttrs(post: Post) {
        post.likesCountAttr ?: postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)?.let { post.likesCountAttr = it }
        post.hitCountAttr ?: postAttrRepository.findBySubjectAndName(post, HIT_COUNT)?.let { post.hitCountAttr = it }
    }

    fun hydratePostAttrs(posts: List<Post>) {
        if (posts.isEmpty()) return

        val attrsByKey =
            postAttrRepository
                .findBySubjectInAndNameIn(posts, listOf(LIKES_COUNT, HIT_COUNT))
                .associateBy { "${it.subject.id}:${it.name}" }

        posts.forEach { post ->
            post.likesCountAttr = post.likesCountAttr ?: attrsByKey["${post.id}:$LIKES_COUNT"]
            post.hitCountAttr = post.hitCountAttr ?: attrsByKey["${post.id}:$HIT_COUNT"]
        }
    }

    fun hydrateMembersProfileImgAttrs(members: List<Member>) {
        if (members.isEmpty()) return

        val uniqueMembers = members.distinctBy { it.id }
        val profileAttrsByMemberId =
            memberAttrRepository
                .findBySubjectInAndNameIn(uniqueMembers, listOf(PROFILE_IMG_URL))
                .associateBy { it.subject.id }

        members.forEach { member ->
            member.getOrInitProfileImgUrlAttr {
                profileAttrsByMemberId[member.id] ?: MemberAttr(0, member, PROFILE_IMG_URL, "")
            }
        }
    }
}
