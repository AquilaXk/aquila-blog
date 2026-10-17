package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_WORKSPACE_PUBLISHED
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
        hydratePostAttrs(listOf(post))
    }

    fun hydratePostAttrs(posts: List<Post>) {
        val missingPosts = posts.filter { it.likesCountAttr == null || it.hitCountAttr == null }
        if (missingPosts.isEmpty()) return

        val attrsByKey =
            postAttrRepository
                .findBySubjectInAndNameIn(missingPosts, listOf(LIKES_COUNT, HIT_COUNT))
                .associateBy { "${it.subject.id}:${it.name}" }

        missingPosts.forEach { post ->
            if (post.likesCountAttr == null) {
                attrsByKey["${post.id}:$LIKES_COUNT"]?.let { post.likesCountAttr = it }
            }
            if (post.hitCountAttr == null) {
                attrsByKey["${post.id}:$HIT_COUNT"]?.let { post.hitCountAttr = it }
            }
        }
    }

    fun hydrateMembersPublishedProfileWorkspaces(members: List<Member>) {
        if (members.isEmpty()) return

        val uniqueMembers = members.distinctBy { it.id }
        val publishedAttrsByMemberId =
            memberAttrRepository
                .findBySubjectInAndNameIn(uniqueMembers, listOf(PROFILE_WORKSPACE_PUBLISHED))
                .associateBy { it.subject.id }

        members.forEach { member ->
            val publishedAttr = publishedAttrsByMemberId[member.id]
            if (member.deletedAt == null || publishedAttr != null) {
                member.getProfileWorkspacePublishedAttr {
                    publishedAttr ?: throw IllegalStateException("profile workspace published is missing")
                }
            }
        }
    }
}
