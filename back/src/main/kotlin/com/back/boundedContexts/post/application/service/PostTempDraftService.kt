package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.post.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.global.exception.application.AppException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import kotlin.jvm.optionals.getOrNull

@Service
class PostTempDraftService(
    private val postRepository: PostRepositoryPort,
    private val memberAttrRepository: MemberAttrRepositoryPort,
) {
    private val activeTempDraftPostIdAttrName = "activeTempDraftPostId"
    private val activeTempDraftLockAttrName = "activeTempDraftLock"

    fun findTemp(author: Member): Post? {
        val persistenceAuthor = author.toPersistenceMember()
        return resolveTrackedTempPost(persistenceAuthor) ?: findLegacyTemp(persistenceAuthor)
    }

    @Transactional
    fun getOrCreateTemp(author: Member): Pair<Post, Boolean> {
        val persistenceAuthor = author.toPersistenceMember()
        if (!tryAcquireTempDraftLock(persistenceAuthor)) {
            throw AppException("409-2", "다른 탭에서 임시글을 준비 중입니다. 잠시 후 다시 시도해주세요.")
        }

        return try {
            val existingTemp = resolveTrackedTempPost(persistenceAuthor) ?: findLegacyTemp(persistenceAuthor)
            if (existingTemp != null) {
                updateTempDraftMarker(persistenceAuthor, existingTemp.id)
                postRepository.flush()
                existingTemp to false
            } else {
                val newPost = postRepository.save(Post(0, persistenceAuthor, "임시글", "임시글 입니다."))
                updateTempDraftMarker(persistenceAuthor, newPost.id)
                postRepository.flush()
                newPost to true
            }
        } finally {
            releaseTempDraftLock(persistenceAuthor)
        }
    }

    fun isTempDraft(post: Post): Boolean = resolveTrackedTempPostId(post.author) == post.id

    fun updateTempDraftMarker(
        author: Member,
        postId: Long?,
    ) {
        val attr =
            memberAttrRepository.findBySubjectAndName(author, activeTempDraftPostIdAttrName)
                ?: MemberAttr(0, author, activeTempDraftPostIdAttrName, "")
        attr.strValue = postId?.toString().orEmpty()
        memberAttrRepository.save(attr)
    }

    private fun findLegacyTemp(author: Member): Post? = postRepository.findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(author, "임시글")

    private fun resolveTrackedTempPost(author: Member): Post? {
        val trackedPostId = resolveTrackedTempPostId(author) ?: return null
        val trackedPost = postRepository.findById(trackedPostId).getOrNull() ?: return null
        return trackedPost.takeIf { it.author.id == author.id }
    }

    private fun resolveTrackedTempPostId(author: Member): Long? =
        memberAttrRepository
            .findBySubjectAndName(author, activeTempDraftPostIdAttrName)
            ?.strValue
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?.toLongOrNull()

    private fun tryAcquireTempDraftLock(author: Member): Boolean {
        val lockValue = memberAttrRepository.incrementIntValue(author, activeTempDraftLockAttrName, 1)
        if (lockValue == 1) return true
        memberAttrRepository.incrementIntValue(author, activeTempDraftLockAttrName, -1)
        return false
    }

    private fun releaseTempDraftLock(author: Member) {
        memberAttrRepository.incrementIntValue(author, activeTempDraftLockAttrName, -1)
    }
}
