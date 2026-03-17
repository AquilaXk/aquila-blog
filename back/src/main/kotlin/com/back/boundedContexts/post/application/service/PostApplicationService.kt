package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.MemberProxy
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostCommentRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostWriteRequestIdempotencyRepositoryPort
import com.back.boundedContexts.post.application.port.output.SecureTipPort
import com.back.boundedContexts.post.domain.POSTS_COUNT
import com.back.boundedContexts.post.domain.POST_COMMENTS_COUNT
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.domain.PostWriteRequestIdempotency
import com.back.boundedContexts.post.domain.postMixin.COMMENTS_COUNT
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.boundedContexts.post.domain.postMixin.META_TAGS_INDEX
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostMetaExtractor
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.boundedContexts.post.event.PostCommentDeletedEvent
import com.back.boundedContexts.post.event.PostCommentModifiedEvent
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostLikedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostUnlikedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.event.application.EventPublisher
import com.back.global.exception.application.AppException
import com.back.global.security.application.HtmlContentSanitizer
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.orm.ObjectOptimisticLockingFailureException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
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
    private val logger = LoggerFactory.getLogger(PostApplicationService::class.java)

    private data class TagCountsCache(
        val expiresAtMillis: Long,
        val values: List<TagCountDto>,
    )

    @Volatile
    private var publicTagCountsCache: TagCountsCache? = null

    private val tagCacheTtlMillis: Long = 60_000

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
        contentHtml: String? = null,
    ): Post {
        val persistenceAuthor = toPersistenceMember(author)
        val normalizedIdempotencyKey = idempotencyKey?.trim()?.takeIf { it.isNotBlank() }

        if (normalizedIdempotencyKey == null) {
            val created =
                writeNewPost(
                    author = author,
                    persistenceAuthor = persistenceAuthor,
                    title = title,
                    content = content,
                    published = published,
                    listed = listed,
                    contentHtml = contentHtml,
                )
            clearExploreCaches()
            return created
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
                contentHtml = contentHtml,
            )

        requestSlot.postId = createdPost.id
        postWriteRequestIdempotencyRepository.save(requestSlot)
        clearExploreCaches()

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
        contentHtml: String? = null,
    ) {
        hydratePostAttrs(post)
        val currentVersion = post.version ?: 0L
        if (expectedVersion != null && expectedVersion != currentVersion) {
            throw AppException("409-1", "다른 세션에서 이미 수정되었습니다. 최신 글을 다시 불러온 뒤 수정해주세요.")
        }

        val previousContent = post.content
        try {
            val sanitizedContentHtml =
                if (contentHtml == null) {
                    post.contentHtml
                } else {
                    HtmlContentSanitizer.sanitizeRichHtmlOrNull(contentHtml)
                }
            post.modify(title, content, published, listed, sanitizedContentHtml)
            postRepository.flush()
            syncMetaTagIndexAttr(post)
        } catch (exception: ObjectOptimisticLockingFailureException) {
            throw AppException("409-1", "다른 세션에서 이미 수정되었습니다. 최신 글을 다시 불러온 뒤 수정해주세요.")
        }
        runCatching {
            uploadedFileRetentionService.syncPostContent(post.id, previousContent, post.content)
        }.onFailure { exception ->
            logger.warn("Failed to sync post attachments on modify: postId={}", post.id, exception)
        }
        clearExploreCaches()

        runCatching {
            eventPublisher.publish(
                PostModifiedEvent(UUID.randomUUID(), PostDto(post), MemberDto(actor)),
            )
        }.onFailure { exception ->
            logger.warn("Failed to publish PostModifiedEvent: postId={}", post.id, exception)
        }
    }

    private fun writeNewPost(
        author: Member,
        persistenceAuthor: Member,
        title: String,
        content: String,
        published: Boolean,
        listed: Boolean,
        contentHtml: String?,
    ): Post {
        val post =
            Post(
                0,
                persistenceAuthor,
                title,
                content,
                null,
                published,
                listed,
                HtmlContentSanitizer.sanitizeRichHtmlOrNull(contentHtml),
            )
        val savedPost = postRepository.saveAndFlush(post)
        syncMetaTagIndexAttr(savedPost)
        runCatching {
            uploadedFileRetentionService.syncPostContent(savedPost.id, null, savedPost.content)
        }.onFailure { exception ->
            logger.warn("Failed to sync post attachments on write: postId={}", savedPost.id, exception)
        }
        incrementMemberPostsCount(persistenceAuthor)

        runCatching {
            eventPublisher.publish(
                PostWrittenEvent(UUID.randomUUID(), PostDto(savedPost), MemberDto(author)),
            )
        }.onFailure { exception ->
            logger.warn("Failed to publish PostWrittenEvent: postId={}", savedPost.id, exception)
        }

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
        val deletedPostContent = post.content

        val softDeleted = postRepository.softDeleteById(post.id)
        if (!softDeleted) {
            throw AppException("404-1", "${post.id}번 글을 찾을 수 없습니다.")
        }
        clearExploreCaches()

        // 카운터 보정 실패는 삭제 실패로 전파하지 않는다. 실패 시 실제 개수 재동기화를 시도한다.
        runCatching {
            decrementMemberPostsCount(Member(post.author.id))
        }.onFailure { exception ->
            logger.warn("Failed to decrement member posts counter for member id={}", post.author.id, exception)
            runCatching {
                reconcileMemberPostsCount(Member(post.author.id))
            }.onFailure { reconcileException ->
                logger.warn("Failed to reconcile member posts counter for member id={}", post.author.id, reconcileException)
            }
        }

        // 삭제 자체는 완료시키고, 보조 처리(파일 정리/이벤트)는 실패해도 트랜잭션을 깨지 않도록 분리한다.
        runCatching {
            uploadedFileRetentionService.scheduleDeletedPostAttachments(deletedPostContent)
        }.onFailure { exception ->
            logger.warn("Failed to schedule cleanup for deleted post id={}", post.id, exception)
        }

        runCatching {
            val postDto = PostDto(post)
            eventPublisher.publish(
                PostDeletedEvent(UUID.randomUUID(), postDto, MemberDto(actor)),
            )
        }.onFailure { exception ->
            logger.warn("Failed to publish PostDeletedEvent for post id={}", post.id, exception)
        }
    }

    @Transactional
    fun writeComment(
        author: Member,
        post: Post,
        content: String,
        parentComment: PostComment? = null,
    ): PostComment {
        val persistenceAuthor = toPersistenceMember(author)
        val persistedParentComment = parentComment?.let { findCommentById(post, it.id) ?: it }
        val comment =
            postCommentRepository.save(
                post.newComment(
                    author = persistenceAuthor,
                    content = content,
                    parentComment = persistedParentComment,
                ),
            )
        incrementCommentsCount(post)
        incrementMemberPostCommentsCount(persistenceAuthor)

        runCatching {
            eventPublisher.publish(
                PostCommentWrittenEvent(UUID.randomUUID(), PostCommentDto(comment), PostDto(post), MemberDto(author)),
            )
        }.onFailure { exception ->
            logger.warn("Failed to publish PostCommentWrittenEvent: postId={}, commentId={}", post.id, comment.id, exception)
        }

        return comment
    }

    @Transactional
    fun modifyComment(
        postComment: PostComment,
        actor: Member,
        content: String,
    ) {
        postComment.modify(content)

        runCatching {
            eventPublisher.publish(
                PostCommentModifiedEvent(
                    UUID.randomUUID(),
                    PostCommentDto(postComment),
                    PostDto(postComment.post),
                    MemberDto(actor),
                ),
            )
        }.onFailure { exception ->
            logger.warn(
                "Failed to publish PostCommentModifiedEvent: postId={}, commentId={}",
                postComment.post.id,
                postComment.id,
                exception,
            )
        }
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

            runCatching {
                eventPublisher.publish(
                    PostCommentDeletedEvent(UUID.randomUUID(), postCommentDto, postDto, MemberDto(actor)),
                )
            }.onFailure { exception ->
                logger.warn(
                    "Failed to publish PostCommentDeletedEvent: postId={}, commentId={}",
                    comment.post.id,
                    comment.id,
                    exception,
                )
            }
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
        val insertedLikeId = postLikeRepository.insertIfAbsent(persistenceActor, post)

        if (insertedLikeId == null) {
            val existingLike = postLikeRepository.findByLikerAndPost(persistenceActor, post)
            if (existingLike != null) {
                ensureLikesCountLoaded(post)
                return PostLikeToggleResult(true, existingLike.id)
            }

            // 동시 unlike 경쟁으로 row가 사라진 경우 한 번 더 보정한다.
            val recoveredLikeId = postLikeRepository.insertIfAbsent(persistenceActor, post)
            if (recoveredLikeId == null) {
                syncLikesCount(post)
                return PostLikeToggleResult(
                    isLiked = postLikeRepository.findByLikerAndPost(persistenceActor, post) != null,
                    likeId = 0,
                )
            }

            incrementLikesCount(post)
            postRepository.flush()
            runCatching {
                eventPublisher.publish(
                    PostLikedEvent(UUID.randomUUID(), post.id, post.author.id, recoveredLikeId, MemberDto(actor)),
                )
            }.onFailure { exception ->
                logger.warn("Failed to publish recovered PostLikedEvent: postId={}, likeId={}", post.id, recoveredLikeId, exception)
            }
            return PostLikeToggleResult(true, recoveredLikeId)
        }

        incrementLikesCount(post)
        postRepository.flush()

        runCatching {
            eventPublisher.publish(
                PostLikedEvent(UUID.randomUUID(), post.id, post.author.id, insertedLikeId, MemberDto(actor)),
            )
        }.onFailure { exception ->
            logger.warn("Failed to publish PostLikedEvent: postId={}, likeId={}", post.id, insertedLikeId, exception)
        }

        return PostLikeToggleResult(true, insertedLikeId)
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
            runCatching {
                eventPublisher.publish(
                    PostUnlikedEvent(UUID.randomUUID(), post.id, postAuthorId, existingLikeId, MemberDto(actor)),
                )
            }.onFailure { exception ->
                logger.warn("Failed to publish PostUnlikedEvent: postId={}, likeId={}", post.id, existingLikeId, exception)
            }
        }

        return PostLikeToggleResult(false, existingLikeId ?: 0)
    }

    @Transactional
    fun reconcileLikeState(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult {
        val persistenceActor = toPersistenceMember(actor)
        hydratePostAttrs(post)
        syncLikesCount(post)
        val existingLike = postLikeRepository.findByLikerAndPost(persistenceActor, post)
        return PostLikeToggleResult(
            isLiked = existingLike != null,
            likeId = existingLike?.id ?: 0,
        )
    }

    @Transactional(readOnly = true)
    fun readLikeSnapshot(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult {
        val persistenceActor = toPersistenceMember(actor)
        post.likesCount = postLikeRepository.countByPost(post).toInt()
        val existingLike = postLikeRepository.findByLikerAndPost(persistenceActor, post)
        return PostLikeToggleResult(
            isLiked = existingLike != null,
            likeId = existingLike?.id ?: 0,
        )
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

    fun getComments(
        post: Post,
        limit: Int,
    ): List<PostComment> =
        postCommentRepository.findByPostOrderByCreatedAtAscIdAsc(post, limit.coerceIn(1, 500)).also { comments ->
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

    fun findDeletedPagedByKwForAdmin(
        kw: String,
        page: Int,
        pageSize: Int,
    ): Page<AdmDeletedPostDto> =
        postRepository.findDeletedPagedByKw(
            kw,
            PageRequest.of(page - 1, pageSize),
        )

    @Transactional
    fun restoreDeletedByIdForAdmin(id: Int): Post {
        val snapshot =
            postRepository.findDeletedSnapshotById(id)
                ?: throw AppException("404-1", "해당 글을 찾을 수 없습니다.")

        val restored = postRepository.restoreDeletedById(id)
        if (!restored) {
            throw AppException("404-1", "이미 복구되었거나 존재하지 않는 글입니다.")
        }

        val authorRef = Member(snapshot.authorId)

        runCatching {
            incrementMemberPostsCount(authorRef)
        }.onFailure { exception ->
            logger.warn("Failed to increment member posts counter for member id={}", snapshot.authorId, exception)
            runCatching {
                reconcileMemberPostsCount(authorRef)
            }.onFailure { reconcileException ->
                logger.warn("Failed to reconcile member posts counter for member id={}", snapshot.authorId, reconcileException)
            }
        }

        runCatching {
            uploadedFileRetentionService.restoreDeletedPostAttachments(snapshot.content)
        }.onFailure { exception ->
            logger.warn("Failed to restore attachments for restored post id={}", id, exception)
        }

        clearExploreCaches()

        return postRepository.findById(id).getOrNull()
            ?: throw AppException("404-1", "복구된 글을 확인할 수 없습니다.")
    }

    @Transactional
    fun hardDeleteDeletedByIdForAdmin(id: Int) {
        val snapshot =
            postRepository.findDeletedSnapshotById(id)
                ?: throw AppException("404-1", "해당 글을 찾을 수 없습니다.")

        runCatching {
            uploadedFileRetentionService.scheduleDeletedPostAttachments(snapshot.content)
        }.onFailure { exception ->
            logger.warn("Failed to schedule cleanup for hard-deleted post id={}", id, exception)
        }

        val hardDeleted = postRepository.hardDeleteDeletedById(id)
        if (!hardDeleted) {
            throw AppException("404-1", "이미 영구삭제되었거나 존재하지 않는 글입니다.")
        }

        clearExploreCaches()
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

    fun findPagedByKwAndTag(
        kw: String,
        tag: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Post> =
        findAndHydratePagedPosts {
            postRepository.findQPagedByKwAndTag(
                kw,
                tag,
                PageRequest.of(page - 1, pageSize, sort.sortBy),
            )
        }

    fun getPublicTagCounts(): List<TagCountDto> {
        val now = System.currentTimeMillis()
        publicTagCountsCache?.takeIf { it.expiresAtMillis > now }?.let { return it.values }

        synchronized(this) {
            val refreshedNow = System.currentTimeMillis()
            publicTagCountsCache?.takeIf { it.expiresAtMillis > refreshedNow }?.let { return it.values }

            val tagCounts = ConcurrentHashMap<String, Int>()
            val indexedTagRows = postRepository.findAllPublicListedTagIndexes(META_TAGS_INDEX)

            if (indexedTagRows.isNotEmpty()) {
                indexedTagRows.forEach { tagIndex ->
                    parseTagIndex(tagIndex).forEach { normalizedTag ->
                        tagCounts.merge(normalizedTag, 1, Int::plus)
                    }
                }
            } else {
                // 태그 인덱스 미구축 레코드가 대부분인 초기 단계에서는 본문 파싱으로 호환한다.
                postRepository.findAllPublicListedContents().forEach { content ->
                    PostMetaExtractor.extract(content).tags.forEach { tag ->
                        val normalizedTag = normalizeTag(tag)
                        if (normalizedTag.isNotBlank()) {
                            tagCounts.merge(normalizedTag, 1, Int::plus)
                        }
                    }
                }
            }

            val result =
                tagCounts
                    .entries
                    .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key.lowercase() })
                    .map { TagCountDto(it.key, it.value) }

            publicTagCountsCache = TagCountsCache(refreshedNow + tagCacheTtlMillis, result)
            return result
        }
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

    private fun incrementCommentsCount(post: Post) {
        val updatedCommentsCount = postAttrRepository.incrementIntValue(post, COMMENTS_COUNT)
        applyCommentsCount(post, updatedCommentsCount)
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

    private fun incrementMemberPostCommentsCount(member: Member) {
        val updatedCount = memberAttrRepository.incrementIntValue(member, POST_COMMENTS_COUNT)
        val refreshedAttr = member.postCommentsCountAttr ?: memberAttrRepository.findBySubjectAndName(member, POST_COMMENTS_COUNT)
        refreshedAttr?.let {
            it.intValue = updatedCount
            member.postCommentsCountAttr = it
        }
    }

    private fun incrementMemberPostsCount(member: Member) {
        val updatedCount = memberAttrRepository.incrementIntValue(member, POSTS_COUNT)
        member.postsCountAttr?.intValue = updatedCount
    }

    private fun decrementMemberPostsCount(member: Member) {
        var updatedCount = memberAttrRepository.incrementIntValue(member, POSTS_COUNT, -1)
        if (updatedCount < 0) {
            updatedCount = memberAttrRepository.incrementIntValue(member, POSTS_COUNT, -updatedCount)
        }
        member.postsCountAttr?.intValue = updatedCount
    }

    private fun reconcileMemberPostsCount(member: Member) {
        val actualCount = postRepository.countByAuthor(member).coerceAtLeast(0).toInt()
        val refreshedAttr = member.postsCountAttr ?: memberAttrRepository.findBySubjectAndName(member, POSTS_COUNT)
        val counterAttr = refreshedAttr ?: MemberAttr(0, member, POSTS_COUNT, actualCount)
        counterAttr.intValue = actualCount
        member.postsCountAttr = counterAttr
        saveMemberAttr(counterAttr)
    }

    private fun saveMemberAttr(attr: MemberAttr?) {
        attr?.let(memberAttrRepository::save)
    }

    // SecurityContext actor는 MemberProxy일 수 있어 영속 경계에서는 실제 엔티티를 사용한다.
    private fun toPersistenceMember(member: Member): Member = if (member is MemberProxy) member.persistenceMember else member

    private fun clearExploreCaches() {
        publicTagCountsCache = null
    }

    private fun syncMetaTagIndexAttr(post: Post) {
        val normalizedTags =
            PostMetaExtractor
                .extract(post.content)
                .tags
                .map(::normalizeTag)
                .filter(String::isNotBlank)
                .distinct()

        val indexValue =
            if (normalizedTags.isEmpty()) {
                ""
            } else {
                normalizedTags.joinToString(separator = "|", prefix = "|", postfix = "|")
            }

        val tagIndexAttr = postAttrRepository.findBySubjectAndName(post, META_TAGS_INDEX) ?: PostAttr(0, post, META_TAGS_INDEX, "")
        if ((tagIndexAttr.strValue ?: "") == indexValue) return

        tagIndexAttr.strValue = indexValue
        postAttrRepository.save(tagIndexAttr)
    }

    private fun normalizeTag(tag: String): String = tag.trim()

    private fun parseTagIndex(tagIndex: String): List<String> =
        tagIndex
            .split('|')
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
}
