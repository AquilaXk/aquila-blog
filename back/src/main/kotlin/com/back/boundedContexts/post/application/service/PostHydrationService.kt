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

        val postsById = missingPosts.associateBy { it.id }
        postAttrRepository
            .findBySubjectInAndNameIn(missingPosts, listOf(LIKES_COUNT, HIT_COUNT))
            .forEach { attr ->
                val post = postsById[attr.subject.id] ?: return@forEach
                if (attr.name == LIKES_COUNT && post.likesCountAttr == null) {
                    post.likesCountAttr = attr
                } else if (attr.name == HIT_COUNT && post.hitCountAttr == null) {
                    post.hitCountAttr = attr
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
