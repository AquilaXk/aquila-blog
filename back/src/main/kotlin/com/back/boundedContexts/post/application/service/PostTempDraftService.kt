package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.springframework.dao.PessimisticLockingFailureException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import kotlin.jvm.optionals.getOrNull

@Service
class PostTempDraftService(
    private val postRepository: PostRepositoryPort,
    private val memberAttrRepository: MemberAttrRepositoryPort,
    private val postHydrationService: PostHydrationService,
    private val postCounterService: PostCounterService? = null,
    private val memberRepository: MemberRepositoryPort? = null,
) {
    private val activeTempDraftPostIdAttrName = "activeTempDraftPostId"

    fun findTemp(author: Member): Post? {
        val persistenceAuthor = author
        return resolveTrackedTempPost(persistenceAuthor)
    }

    @Transactional
    fun getOrCreateTemp(author: Member): Pair<Post, Boolean> {
        val persistenceAuthor = acquireTempDraftAuthorLock(author)
        postHydrationService.hydrateMembersPublishedProfileWorkspaces(listOf(persistenceAuthor))

        val existingTemp = resolveTrackedTempPost(persistenceAuthor)
        if (existingTemp != null) {
            if (!existingTemp.isTempDraft) {
                existingTemp.isTempDraft = true
                postRepository.save(existingTemp)
            }
            updateTempDraftMarker(persistenceAuthor, existingTemp.id)
            postRepository.flush()
            return existingTemp to false
        }

        val newPost = postRepository.save(Post(0, persistenceAuthor, "임시글", "임시글 입니다.", isTempDraft = true))
        updateTempDraftMarker(persistenceAuthor, newPost.id)
        postRepository.flush()
        postCounterService?.incrementMemberPostsCount(persistenceAuthor)
        return newPost to true
    }

    fun isTempDraft(post: Post): Boolean = post.isTempDraft || resolveTrackedTempPostId(post.author) == post.id

    fun resolveTempDraftPostIds(posts: List<Post>): Set<Long> {
        if (posts.isEmpty()) return emptySet()
        val result = HashSet<Long>(posts.size)
        val fallbackAuthors = LinkedHashMap<Long, Member>()
        val pendingCheckPosts = ArrayList<Post>(posts.size)
        for (post in posts) {
            if (post.isTempDraft) {
                result.add(post.id)
            } else {
                pendingCheckPosts.add(post)
                fallbackAuthors.putIfAbsent(post.author.id, post.author)
            }
        }
        if (pendingCheckPosts.isEmpty()) {
            return result
        }
        val trackedPostIdByAuthorId = HashMap<Long, Long>(fallbackAuthors.size * 2)
        val attrs =
            memberAttrRepository.findBySubjectInAndNameIn(
                fallbackAuthors.values.toList(),
                listOf(activeTempDraftPostIdAttrName),
            )
        for (attr in attrs) {
            val trackedPostId = parseTrackedPostId(attr.strValue)
            if (trackedPostId != null) {
                trackedPostIdByAuthorId[attr.subject.id] = trackedPostId
            }
        }
        for (post in pendingCheckPosts) {
            if (trackedPostIdByAuthorId[post.author.id] == post.id) {
                result.add(post.id)
            }
        }
        return result
    }

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

    private fun resolveTrackedTempPost(author: Member): Post? {
        val trackedPostId = resolveTrackedTempPostId(author) ?: return null
        val trackedPost = postRepository.findById(trackedPostId).getOrNull() ?: return null
        return trackedPost.takeIf { it.author.id == author.id }
    }

    private fun resolveTrackedTempPostId(author: Member): Long? =
        parseTrackedPostId(memberAttrRepository.findBySubjectAndName(author, activeTempDraftPostIdAttrName)?.strValue)

    private fun parseTrackedPostId(raw: String?): Long? = raw?.trim()?.takeIf { it.isNotEmpty() }?.toLongOrNull()

    private fun acquireTempDraftAuthorLock(author: Member): Member {
        val repo = memberRepository ?: return author
        return try {
            repo.findByIdForUpdate(author.id).orElse(author)
        } catch (exception: PessimisticLockingFailureException) {
            throw AppException(
                ErrorCode.RESOURCE_CONFLICT,
                "다른 탭에서 임시글을 준비 중입니다. 잠시 후 다시 시도해주세요.",
                exception,
            )
        }
    }
}
