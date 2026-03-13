package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.MemberProxy
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.application.port.out.MemberAttrRepositoryPort
import com.back.boundedContexts.post.application.port.out.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.out.PostCommentRepositoryPort
import com.back.boundedContexts.post.application.port.out.PostLikeRepositoryPort
import com.back.boundedContexts.post.application.port.out.PostRepositoryPort
import com.back.boundedContexts.post.application.port.out.PostWriteRequestIdempotencyRepositoryPort
import com.back.boundedContexts.post.application.port.out.SecureTipPort
import com.back.boundedContexts.post.domain.POSTS_COUNT
import com.back.boundedContexts.post.domain.POST_COMMENTS_COUNT
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.domain.PostLike
import com.back.boundedContexts.post.domain.PostWriteRequestIdempotency
import com.back.boundedContexts.post.domain.postMixin.COMMENTS_COUNT
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.event.PostCommentDeletedEvent
import com.back.boundedContexts.post.event.PostCommentModifiedEvent
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostLikedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostUnlikedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.event.app.EventPublisher
import com.back.global.exception.app.AppException
import com.back.global.storage.app.UploadedFileRetentionService
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.orm.ObjectOptimisticLockingFailureException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID
import kotlin.jvm.optionals.getOrNull

@Service
class PostApplicationService(
    private val postRepository: PostRepositoryPort,
    private val postAttrRepository: PostAttrRepositoryPort,
    private val memberAttrRepository: MemberAttrRepositoryPort,
    private val postCommentRepository: PostCommentRepositoryPort,
    private val postLikeRepository: PostLikeRepositoryPort,
    private val postWriteRequestIdempotencyRepository: PostWriteRequestIdempotencyRepositoryPort,
    private val secureTipPort: SecureTipPort,
    private val eventPublisher: EventPublisher,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
) {
    fun count(): Long = postRepository.count()

    fun randomSecureTip(): String = secureTipPort.randomSecureTip()

    @Transactional
    fun write(
        author: Member,
        title: String,
        content: String,
        published: Boolean = false,
        listed: Boolean = false,
        idempotencyKey: String? = null,
    ): Post {
        val persistenceAuthor = toPersistenceMember(author)
        val normalizedIdempotencyKey = idempotencyKey?.trim()?.takeIf { it.isNotBlank() }

        if (normalizedIdempotencyKey == null) {
            return writeNewPost(
                author = author,
                persistenceAuthor = persistenceAuthor,
                title = title,
                content = content,
                published = published,
                listed = listed,
            )
        }

        val existingRequest =
            postWriteRequestIdempotencyRepository.findByActorAndRequestKey(
                persistenceAuthor,
                normalizedIdempotencyKey,
            )

        if (existingRequest?.postId != null) {
            return postRepository.findById(existingRequest.postId!!).getOrNull()
                ?: throw AppException("409-1", "이전 작성 요청 결과를 확인할 수 없습니다. 다시 시도해주세요.")
        }

        val requestSlot = existingRequest ?: createIdempotencyRequestSlot(persistenceAuthor, normalizedIdempotencyKey)

        if (requestSlot.postId != null) {
            return postRepository.findById(requestSlot.postId!!).getOrNull()
                ?: throw AppException("409-1", "이전 작성 요청 결과를 확인할 수 없습니다. 다시 시도해주세요.")
        }

        val createdPost =
            writeNewPost(
                author = author,
                persistenceAuthor = persistenceAuthor,
                title = title,
                content = content,
                published = published,
                listed = listed,
            )

        requestSlot.postId = createdPost.id
        postWriteRequestIdempotencyRepository.save(requestSlot)

        return createdPost
    }

    fun findById(id: Int): Post? =
        postRepository
            .findById(id)
            .getOrNull()
            ?.also { post ->
                hydratePostAttrs(post)
                hydrateMembersProfileImgAttrs(listOf(post.author))
            }

    fun findLatest(): Post? = postRepository.findFirstByOrderByIdDesc()

    @Transactional
    fun modify(
        actor: Member,
        post: Post,
        title: String,
        content: String,
        published: Boolean? = null,
        listed: Boolean? = null,
        expectedVersion: Long? = null,
    ) {
        hydratePostAttrs(post)
        val currentVersion = post.version ?: 0L
        if (expectedVersion != null && expectedVersion != currentVersion) {
            throw AppException("409-1", "다른 세션에서 이미 수정되었습니다. 최신 글을 다시 불러온 뒤 수정해주세요.")
        }

        val previousContent = post.content
        try {
            post.modify(title, content, published, listed)
            postRepository.flush()
        } catch (exception: ObjectOptimisticLockingFailureException) {
            throw AppException("409-1", "다른 세션에서 이미 수정되었습니다. 최신 글을 다시 불러온 뒤 수정해주세요.")
        }
        uploadedFileRetentionService.syncPostContent(post.id, previousContent, post.content)

        eventPublisher.publish(
            PostModifiedEvent(UUID.randomUUID(), PostDto(post), MemberDto(actor)),
        )
    }

    private fun writeNewPost(
        author: Member,
        persistenceAuthor: Member,
        title: String,
        content: String,
        published: Boolean,
        listed: Boolean,
    ): Post {
        val post = Post(0, persistenceAuthor, title, content, null, published, listed)
        val savedPost = postRepository.saveAndFlush(post)
        uploadedFileRetentionService.syncPostContent(savedPost.id, null, savedPost.content)
        hydrateMemberCounterAttrs(persistenceAuthor)
        persistenceAuthor.incrementPostsCount()
        saveMemberAttr(persistenceAuthor.postsCountAttr)

        eventPublisher.publish(
            PostWrittenEvent(UUID.randomUUID(), PostDto(savedPost), MemberDto(author)),
        )

        return savedPost
    }

    private fun createIdempotencyRequestSlot(
        persistenceAuthor: Member,
        idempotencyKey: String,
    ): PostWriteRequestIdempotency {
        try {
            return postWriteRequestIdempotencyRepository.saveAndFlush(
                PostWriteRequestIdempotency(
                    actor = persistenceAuthor,
                    requestKey = idempotencyKey,
                ),
            )
        } catch (exception: DataIntegrityViolationException) {
            val concurrentRequest =
                postWriteRequestIdempotencyRepository.findByActorAndRequestKey(
                    persistenceAuthor,
                    idempotencyKey,
                ) ?: throw exception

            if (concurrentRequest.postId != null) {
                return concurrentRequest
            }
            throw AppException("409-1", "동일한 글 작성 요청이 처리 중입니다. 잠시 후 다시 시도해주세요.")
        }
    }

    @Transactional
    fun delete(
        post: Post,
        actor: Member,
    ) {
        hydratePostAttrs(post)
        hydrateMemberCounterAttrs(post.author)
        val postDto = PostDto(post)
        uploadedFileRetentionService.scheduleDeletedPostAttachments(post.content)

        eventPublisher.publish(
            PostDeletedEvent(UUID.randomUUID(), postDto, MemberDto(actor)),
        )

        post.author.decrementPostsCount()
        saveMemberAttr(post.author.postsCountAttr)
        post.softDelete()
    }

    @Transactional
    fun writeComment(
        author: Member,
        post: Post,
        content: String,
        parentComment: PostComment? = null,
    ): PostComment {
        val persistenceAuthor = toPersistenceMember(author)
        hydratePostAttrs(post)
        hydrateMemberCounterAttrs(persistenceAuthor)
        val persistedParentComment = parentComment?.let { findCommentById(post, it.id) ?: it }
        val comment =
            postCommentRepository.save(
                post.newComment(
                    author = persistenceAuthor,
                    content = content,
                    parentComment = persistedParentComment,
                ),
            )
        post.onCommentAdded()
        savePostAttr(post.commentsCountAttr)
        persistenceAuthor.incrementPostCommentsCount()
        saveMemberAttr(persistenceAuthor.postCommentsCountAttr)
        postRepository.flush()

        eventPublisher.publish(
            PostCommentWrittenEvent(UUID.randomUUID(), PostCommentDto(comment), PostDto(post), MemberDto(author)),
        )

        return comment
    }

    @Transactional
    fun modifyComment(
        postComment: PostComment,
        actor: Member,
        content: String,
    ) {
        postComment.modify(content)

        eventPublisher.publish(
            PostCommentModifiedEvent(
                UUID.randomUUID(),
                PostCommentDto(postComment),
                PostDto(postComment.post),
                MemberDto(actor),
            ),
        )
    }

    @Transactional
    fun deleteComment(
        post: Post,
        postComment: PostComment,
        actor: Member,
    ) {
        hydratePostAttrs(post)
        val commentsToDelete =
            postCommentRepository
                .findActiveSubtreeByPostAndRootCommentId(post, postComment.id)
                .ifEmpty { listOf(postComment) }

        commentsToDelete.forEach { hydrateMemberCounterAttrs(it.author) }

        val postDto = PostDto(post)
        commentsToDelete.forEach { comment ->
            val postCommentDto = PostCommentDto(comment)
            comment.author.decrementPostCommentsCount()
            saveMemberAttr(comment.author.postCommentsCountAttr)
            post.onCommentDeleted()
            comment.softDelete()

            eventPublisher.publish(
                PostCommentDeletedEvent(UUID.randomUUID(), postCommentDto, postDto, MemberDto(actor)),
            )
        }

        savePostAttr(post.commentsCountAttr)
        postRepository.flush()
    }

    @Transactional
    fun toggleLike(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult = if (isLiked(post, actor)) unlike(post, actor) else like(post, actor)

    @Transactional
    fun like(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult {
        val persistenceActor = toPersistenceMember(actor)
        hydratePostAttrs(post)
        val existingLike = postLikeRepository.findByLikerAndPost(persistenceActor, post)
        if (existingLike != null) {
            ensureLikesCountLoaded(post)
            return PostLikeToggleResult(true, existingLike.id)
        }

        return try {
            val savedLike = postLikeRepository.save(PostLike(0, persistenceActor, post))
            incrementLikesCount(post)
            postRepository.flush()

            eventPublisher.publish(
                PostLikedEvent(UUID.randomUUID(), post.id, post.author.id, savedLike.id, MemberDto(actor)),
            )

            PostLikeToggleResult(true, savedLike.id)
        } catch (exception: DataIntegrityViolationException) {
            val resolvedLike = postLikeRepository.findByLikerAndPost(persistenceActor, post) ?: throw exception
            syncLikesCount(post)
            PostLikeToggleResult(true, resolvedLike.id)
        }
    }

    @Transactional
    fun unlike(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult {
        val persistenceActor = toPersistenceMember(actor)
        hydratePostAttrs(post)
        val existingLike = postLikeRepository.findByLikerAndPost(persistenceActor, post)
        val postAuthorId = post.author.id
        val existingLikeId = existingLike?.id
        val deletedCount = postLikeRepository.deleteByLikerAndPost(persistenceActor, post)
        if (deletedCount > 1) {
            // Legacy 중복 row 정리 시에는 실제 개수 기준으로 즉시 재동기화한다.
            syncLikesCount(post)
        } else if (deletedCount == 1) {
            decrementLikesCount(post)
        } else {
            ensureLikesCountLoaded(post)
        }
        postRepository.flush()

        if (deletedCount > 0 && existingLikeId != null) {
            eventPublisher.publish(
                PostUnlikedEvent(UUID.randomUUID(), post.id, postAuthorId, existingLikeId, MemberDto(actor)),
            )
        }

        return PostLikeToggleResult(false, existingLikeId ?: 0)
    }

    @Transactional
    fun incrementHit(post: Post) {
        val updatedHitCount = postAttrRepository.incrementIntValue(post, HIT_COUNT)
        val refreshedAttr = post.hitCountAttr ?: postAttrRepository.findBySubjectAndName(post, HIT_COUNT)
        refreshedAttr?.let {
            it.intValue = updatedHitCount
            post.hitCountAttr = it
        }
    }

    fun getComments(post: Post): List<PostComment> =
        postCommentRepository.findByPostOrderByCreatedAtAscIdAsc(post).also { comments ->
            hydrateMembersProfileImgAttrs(comments.map { it.author })
        }

    fun findCommentById(
        post: Post,
        id: Int,
    ): PostComment? = postCommentRepository.findByPostAndId(post, id)

    fun isLiked(
        post: Post,
        liker: Member?,
    ): Boolean {
        if (liker == null) return false
        return postLikeRepository.findByLikerAndPost(toPersistenceMember(liker), post) != null
    }

    fun findLikedPostIds(
        liker: Member?,
        posts: List<Post>,
    ): Set<Int> {
        if (liker == null || posts.isEmpty()) return emptySet()
        return postLikeRepository
            .findByLikerAndPostIn(toPersistenceMember(liker), posts)
            .map { it.post.id }
            .toSet()
    }

    fun findPagedByKw(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Post> =
        findAndHydratePagedPosts {
            postRepository.findQPagedByKw(
                kw,
                PageRequest.of(page - 1, pageSize, sort.sortBy),
            )
        }

    fun findPagedByKwForAdmin(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Post> =
        findAndHydratePagedPosts {
            postRepository.findQPagedByKwForAdmin(
                kw,
                PageRequest.of(page - 1, pageSize, sort.sortBy),
            )
        }

    fun findPagedByAuthor(
        author: Member,
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Post> =
        findAndHydratePagedPosts {
            postRepository.findQPagedByAuthorAndKw(
                toPersistenceMember(author),
                kw,
                PageRequest.of(page - 1, pageSize, sort.sortBy),
            )
        }

    fun findTemp(author: Member): Post? =
        postRepository.findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(toPersistenceMember(author), "임시글")

    @Transactional
    fun getOrCreateTemp(author: Member): Pair<Post, Boolean> {
        val existingTemp = findTemp(author)
        if (existingTemp != null) return existingTemp to false

        val newPost = Post(0, toPersistenceMember(author), "임시글", "임시글 입니다.")
        return postRepository.save(newPost) to true
    }

    private fun findAndHydratePagedPosts(loader: () -> Page<Post>): Page<Post> {
        val page = loader()
        hydratePostAttrs(page.content)
        hydrateMembersProfileImgAttrs(page.content.map { it.author })
        return page
    }

    private fun hydratePostAttrs(post: Post) {
        post.likesCountAttr ?: postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)?.let { post.likesCountAttr = it }
        post.commentsCountAttr ?: postAttrRepository.findBySubjectAndName(post, COMMENTS_COUNT)?.let { post.commentsCountAttr = it }
        post.hitCountAttr ?: postAttrRepository.findBySubjectAndName(post, HIT_COUNT)?.let { post.hitCountAttr = it }
    }

    private fun hydratePostAttrs(posts: List<Post>) {
        if (posts.isEmpty()) return

        // 목록 조회 시 post마다 natural-id lookup을 반복하면 쿼리가 급증하므로 일괄 hydrate 한다.
        val attrsByKey =
            postAttrRepository
                .findBySubjectInAndNameIn(posts, listOf(LIKES_COUNT, COMMENTS_COUNT, HIT_COUNT))
                .associateBy { "${it.subject.id}:${it.name}" }

        posts.forEach { post ->
            post.likesCountAttr = post.likesCountAttr ?: attrsByKey["${post.id}:$LIKES_COUNT"]
            post.commentsCountAttr = post.commentsCountAttr ?: attrsByKey["${post.id}:$COMMENTS_COUNT"]
            post.hitCountAttr = post.hitCountAttr ?: attrsByKey["${post.id}:$HIT_COUNT"]
        }
    }

    private fun hydrateMemberCounterAttrs(member: Member) {
        member.postsCountAttr ?: memberAttrRepository.findBySubjectAndName(member, POSTS_COUNT)?.let { member.postsCountAttr = it }
        member.postCommentsCountAttr ?: memberAttrRepository
            .findBySubjectAndName(member, POST_COMMENTS_COUNT)
            ?.let { member.postCommentsCountAttr = it }
    }

    private fun hydrateMembersProfileImgAttrs(members: List<Member>) {
        if (members.isEmpty()) return

        val uniqueMembers = members.distinctBy { it.id }
        val profileAttrsByMemberId =
            memberAttrRepository
                .findBySubjectInAndNameIn(uniqueMembers, listOf(PROFILE_IMG_URL))
                .associateBy { it.subject.id }

        // DTO 매핑에서 redirectToProfileImgUrlOrDefault 접근 시 profile attr lazy-load를 미리 해소한다.
        uniqueMembers.forEach { member ->
            member.getOrInitProfileImgUrlAttr {
                profileAttrsByMemberId[member.id] ?: MemberAttr(0, member, PROFILE_IMG_URL, "")
            }
        }
    }

    private fun savePostAttr(attr: PostAttr?) {
        attr?.let(postAttrRepository::save)
    }

    private fun syncLikesCount(post: Post) {
        val actualLikesCount = postLikeRepository.countByPost(post).toInt()
        post.likesCount = actualLikesCount
        savePostAttr(post.likesCountAttr)
    }

    private fun ensureLikesCountLoaded(post: Post) {
        post.likesCountAttr = postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)
    }

    private fun incrementLikesCount(post: Post) {
        val updatedLikesCount = postAttrRepository.incrementIntValue(post, LIKES_COUNT)
        applyLikesCount(post, updatedLikesCount)
    }

    private fun decrementLikesCount(post: Post) {
        val updatedLikesCount = postAttrRepository.incrementIntValue(post, LIKES_COUNT, -1).coerceAtLeast(0)
        applyLikesCount(post, updatedLikesCount)
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

    private fun saveMemberAttr(attr: MemberAttr?) {
        attr?.let(memberAttrRepository::save)
    }

    // SecurityContext actor는 MemberProxy일 수 있어 영속 경계에서는 실제 엔티티를 사용한다.
    private fun toPersistenceMember(member: Member): Member = if (member is MemberProxy) member.persistenceMember else member
}
