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
import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
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
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
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
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import io.micrometer.core.instrument.MeterRegistry
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.cache.CacheManager
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.orm.ObjectOptimisticLockingFailureException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.jvm.optionals.getOrNull

/**
 * PostApplicationService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class PostApplicationService(
    private val postRepository: PostRepositoryPort,
    private val postTagIndexRepository: PostTagIndexRepositoryPort,
    private val postAttrRepository: PostAttrRepositoryPort,
    private val memberAttrRepository: MemberAttrRepositoryPort,
    private val postCommentRepository: PostCommentRepositoryPort,
    private val postLikeRepository: PostLikeRepositoryPort,
    private val postWriteRequestIdempotencyRepository: PostWriteRequestIdempotencyRepositoryPort,
    private val secureTipPort: SecureTipPort,
    private val eventPublisher: EventPublisher,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
    private val cacheManager: CacheManager,
    private val meterRegistry: MeterRegistry? = null,
    private val postRecommendRankingService: PostRecommendRankingService,
    private val postRecommendFeatureStoreService: PostRecommendFeatureStoreService,
    private val postKeywordSearchPipelineService: PostKeywordSearchPipelineService,
    @param:Value("\${custom.post.read.tags-local-cache-ttl-seconds:180}")
    private val tagsLocalCacheTtlSeconds: Long,
) {
    private val logger = LoggerFactory.getLogger(PostApplicationService::class.java)
    private val activeTempDraftPostIdAttrName = "activeTempDraftPostId"
    private val activeTempDraftLockAttrName = "activeTempDraftLock"

    private data class TagCountsCache(
        val expiresAtMillis: Long,
        val values: List<TagCountDto>,
    )

    @Volatile
    private var publicTagCountsCache: TagCountsCache? = null

    private val tagCacheTtlMillis: Long = tagsLocalCacheTtlSeconds.coerceAtLeast(5) * 1_000
    private val hotPageSizes = listOf(30, 24)
    private val hotSorts = listOf(PostSearchSortType1.CREATED_AT)
    private val maxTagCacheEvict = 12

    fun count(): Long = postRepository.count()

    fun randomSecureTip(): String = secureTipPort.randomSecureTip()

    /**
     * 생성 요청을 처리하고 멱등성·후속 동기화 절차를 함께 수행합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
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
            val createdTags = extractNormalizedTags(created.content)
            val isPublic = isPubliclyListed(created)
            clearReadCaches(
                postId = created.id,
                afterTags = createdTags,
                evictHotReadPages = isPublic,
                evictSearchFirstPage = isPublic,
                evictImpactedTagPages = isPublic,
                evictTagsPublic = isPublic,
                evictDetail = isPublic,
                evictReason = "write",
            )
            if (isPublic) {
                postRecommendFeatureStoreService.refresh(created)
            } else {
                postRecommendFeatureStoreService.evict(created.id)
            }
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
        val createdTags = extractNormalizedTags(createdPost.content)
        val isPublic = isPubliclyListed(createdPost)
        clearReadCaches(
            postId = createdPost.id,
            afterTags = createdTags,
            evictHotReadPages = isPublic,
            evictSearchFirstPage = isPublic,
            evictImpactedTagPages = isPublic,
            evictTagsPublic = isPublic,
            evictDetail = isPublic,
            evictReason = "write-idempotent",
        )
        if (isPublic) {
            postRecommendFeatureStoreService.refresh(createdPost)
        } else {
            postRecommendFeatureStoreService.evict(createdPost.id)
        }

        return createdPost
    }

    fun findById(id: Long): Post? =
        postRepository
            .findById(id)
            .getOrNull()
            ?.also { post ->
                hydratePostAttrs(post)
                hydrateMembersProfileImgAttrs(listOf(post.author))
            }

    fun findPublicDetailById(id: Long): Post? =
        postRepository
            .findPublicDetailById(id)
            ?.also { post ->
                if (post.likesCountAttr == null || post.commentsCountAttr == null || post.hitCountAttr == null) {
                    hydratePostAttrs(post)
                }
                hydrateMembersProfileImgAttrs(listOf(post.author))
            }

    fun findPublicDetailContentById(id: Long): PublicPostDetailContentCacheDto? = postRepository.findPublicDetailContentById(id)

    fun findLatest(): Post? = postRepository.findFirstByOrderByIdDesc()

    /**
     * 수정 요청을 처리하고 낙관적 잠금/후속 동기화를 수행합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    @Transactional
    fun modify(
        actor: Member,
        post: Post,
        title: String,
        content: String,
        published: Boolean? = null,
        listed: Boolean? = null,
        expectedVersion: Long,
        contentHtml: String? = null,
    ) {
        hydratePostAttrs(post)
        val currentVersion = post.version ?: 0L
        val wasTempDraft = isTempDraft(post)
        if (expectedVersion != currentVersion) {
            throw AppException("409-1", "다른 세션에서 이미 수정되었습니다. 최신 글을 다시 불러온 뒤 수정해주세요.")
        }

        val previousTitle = post.title
        val previousContent = post.content
        val wasPublic = isPubliclyListed(post)
        val previousTags = extractNormalizedTags(previousContent)
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
            if (wasTempDraft) {
                updateTempDraftMarker(post.author, null)
            }
        } catch (exception: ObjectOptimisticLockingFailureException) {
            throw AppException("409-1", "다른 세션에서 이미 수정되었습니다. 최신 글을 다시 불러온 뒤 수정해주세요.")
        }
        runCatching {
            uploadedFileRetentionService.syncPostContent(post.id, previousContent, post.content)
        }.onFailure { exception ->
            logger.warn("Failed to sync post attachments on modify: postId={}", post.id, exception)
        }
        val afterTags = extractNormalizedTags(post.content)
        val isPublic = isPubliclyListed(post)
        val listingVisibilityChanged = wasPublic != isPublic
        val contentChanged = previousContent != post.content
        val titleChanged = previousTitle != post.title
        val tagChanged = previousTags != afterTags
        val affectsPublicRead = wasPublic || isPublic
        clearReadCaches(
            postId = post.id,
            beforeTags = previousTags,
            afterTags = afterTags,
            evictHotReadPages = affectsPublicRead,
            evictSearchFirstPage = affectsPublicRead && (listingVisibilityChanged || titleChanged || contentChanged || tagChanged),
            evictImpactedTagPages = affectsPublicRead && (tagChanged || listingVisibilityChanged),
            evictTagsPublic = affectsPublicRead && (tagChanged || listingVisibilityChanged),
            evictDetail = affectsPublicRead && (listingVisibilityChanged || titleChanged || contentChanged),
            evictReason = "modify",
        )
        if (isPublic) {
            postRecommendFeatureStoreService.refresh(post)
        } else {
            postRecommendFeatureStoreService.evict(post.id)
        }

        runCatching {
            eventPublisher.publish(
                PostModifiedEvent(
                    UUID.randomUUID(),
                    PostDto(post),
                    MemberDto(actor),
                    previousTags,
                    afterTags,
                ),
            )
        }.onFailure { exception ->
            logger.warn("Failed to publish PostModifiedEvent: postId={}", post.id, exception)
        }
    }

    /**
     * 생성 요청을 처리하고 멱등성·후속 동기화 절차를 함께 수행합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
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
        val afterTags = extractNormalizedTags(savedPost.content)

        runCatching {
            eventPublisher.publish(
                PostWrittenEvent(
                    UUID.randomUUID(),
                    PostDto(savedPost),
                    MemberDto(author),
                    emptyList(),
                    afterTags,
                ),
            )
        }.onFailure { exception ->
            logger.warn("Failed to publish PostWrittenEvent: postId={}", savedPost.id, exception)
        }

        return savedPost
    }

    /**
     * IdempotencyRequestSlot 항목을 생성한다.
     */
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

    /**
     * 삭제 요청을 처리하고 캐시/카운터/첨부파일 정리를 후속으로 연결합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    @Transactional
    fun delete(
        post: Post,
        actor: Member,
    ) {
        val deletedPostContent = post.content
        val wasPublic = isPubliclyListed(post)
        val wasTempDraft = isTempDraft(post)
        val beforeTags = extractNormalizedTags(deletedPostContent)

        val softDeleted = postRepository.softDeleteById(post.id)
        if (!softDeleted) {
            throw AppException("404-1", "${post.id}번 글을 찾을 수 없습니다.")
        }
        if (wasTempDraft) {
            updateTempDraftMarker(post.author, null)
        }
        clearReadCaches(
            postId = post.id,
            beforeTags = beforeTags,
            afterTags = emptyList(),
            evictHotReadPages = wasPublic,
            evictSearchFirstPage = wasPublic,
            evictImpactedTagPages = wasPublic,
            evictTagsPublic = wasPublic,
            evictDetail = wasPublic,
            evictReason = "soft-delete",
        )
        postRecommendFeatureStoreService.evict(post.id)

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
                PostDeletedEvent(
                    UUID.randomUUID(),
                    postDto,
                    MemberDto(actor),
                    beforeTags,
                    emptyList(),
                ),
            )
        }.onFailure { exception ->
            logger.warn("Failed to publish PostDeletedEvent for post id={}", post.id, exception)
        }
    }

    /**
     * 댓글 생성 요청을 처리하고 댓글/작성자 집계값을 함께 갱신합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
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
        refreshRecommendFeatureStoreForPublicPost(post)

        runCatching {
            eventPublisher.publish(
                PostCommentWrittenEvent(UUID.randomUUID(), PostCommentDto(comment), PostDto(post), MemberDto(author)),
            )
        }.onFailure { exception ->
            logger.warn("Failed to publish PostCommentWrittenEvent: postId={}, commentId={}", post.id, comment.id, exception)
        }

        return comment
    }

    /**
     * 댓글 내용을 수정하고 변경 이벤트를 발행합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
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

    /**
     * 댓글 삭제를 처리하고 연관 집계값을 함께 보정합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
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
        refreshRecommendFeatureStoreForPublicPost(post)
    }

    /**
     * 좋아요 상태 변경을 반영하고 경쟁 상황에서의 정합성을 보장합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
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
                    isLiked = postLikeRepository.existsByLikerAndPost(persistenceActor, post),
                    likeId = 0L,
                )
            }

            incrementLikesCount(post)
            postRepository.flush()
            refreshRecommendFeatureStoreForPublicPost(post)
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
        refreshRecommendFeatureStoreForPublicPost(post)

        runCatching {
            eventPublisher.publish(
                PostLikedEvent(UUID.randomUUID(), post.id, post.author.id, insertedLikeId, MemberDto(actor)),
            )
        }.onFailure { exception ->
            logger.warn("Failed to publish PostLikedEvent: postId={}, likeId={}", post.id, insertedLikeId, exception)
        }

        return PostLikeToggleResult(true, insertedLikeId)
    }

    /**
     * 좋아요 상태 변경을 반영하고 경쟁 상황에서의 정합성을 보장합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
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
        refreshRecommendFeatureStoreForPublicPost(post)

        if (deletedCount > 0 && existingLikeId != null) {
            runCatching {
                eventPublisher.publish(
                    PostUnlikedEvent(UUID.randomUUID(), post.id, postAuthorId, existingLikeId, MemberDto(actor)),
                )
            }.onFailure { exception ->
                logger.warn("Failed to publish PostUnlikedEvent: postId={}, likeId={}", post.id, existingLikeId, exception)
            }
        }

        return PostLikeToggleResult(false, existingLikeId ?: 0L)
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
            likeId = existingLike?.id ?: 0L,
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
            likeId = existingLike?.id ?: 0L,
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

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    fun findCommentById(
        post: Post,
        id: Long,
    ): PostComment? = postCommentRepository.findByPostAndId(post, id)

    /**
     * 검증 규칙을 적용해 허용 여부를 판정합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    fun isLiked(
        post: Post,
        liker: Member?,
    ): Boolean {
        if (liker == null) return false
        return postLikeRepository.existsByLikerAndPost(toPersistenceMember(liker), post)
    }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    fun findLikedPostIds(
        liker: Member?,
        posts: List<Post>,
    ): Set<Long> {
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
    ): PagedResult<Post> {
        val normalizedKw = kw.trim()
        val safePage = page.coerceAtLeast(1)
        val safePageSize = pageSize.coerceIn(1, 100)

        if (!postKeywordSearchPipelineService.shouldApply(normalizedKw, sort, safePage)) {
            return findAndHydratePagedPosts(safePage, safePageSize) {
                postRepository.findQPagedByKw(
                    PostRepositoryPort.PagedQuery(
                        kw = normalizedKw,
                        zeroBasedPage = safePage - 1,
                        pageSize = safePageSize,
                        sortProperty = sort.property,
                        sortAscending = sort.isAsc,
                    ),
                )
            }
        }

        val candidatePoolSize = postKeywordSearchPipelineService.resolveCandidatePoolSize(safePageSize)
        val candidateResult =
            findAndHydratePagedPosts(page = 1, pageSize = candidatePoolSize) {
                postRepository.findQPagedByKw(
                    PostRepositoryPort.PagedQuery(
                        kw = normalizedKw,
                        zeroBasedPage = 0,
                        pageSize = candidatePoolSize,
                        sortProperty = sort.property,
                        sortAscending = sort.isAsc,
                    ),
                )
            }

        return postKeywordSearchPipelineService.rerank(
            keyword = normalizedKw,
            candidates = candidateResult.content,
            page = safePage,
            pageSize = safePageSize,
            candidateTotalElements = candidateResult.totalElements,
        )
    }

    fun findRecommendedExplorePage(
        page: Int,
        pageSize: Int,
    ): PagedResult<Post> {
        val safePage = page.coerceAtLeast(1)
        val safePageSize = pageSize.coerceIn(1, 100)

        if (!postRecommendRankingService.isEnabledForPage(safePage)) {
            return findPagedByKw("", PostSearchSortType1.CREATED_AT, safePage, safePageSize)
        }

        val poolSize = postRecommendRankingService.resolveCandidatePoolSize(safePageSize)
        val candidateResult =
            findAndHydratePagedPosts(page = 1, pageSize = poolSize) {
                postRepository.findQPagedByKw(
                    PostRepositoryPort.PagedQuery(
                        kw = "",
                        zeroBasedPage = 0,
                        pageSize = poolSize,
                        sortProperty = PostSearchSortType1.CREATED_AT.property,
                        sortAscending = false,
                    ),
                )
            }
        if (candidateResult.content.isEmpty()) {
            return PagedResult(
                content = emptyList(),
                page = safePage,
                pageSize = safePageSize,
                totalElements = 0,
            )
        }

        return postRecommendRankingService.rerank(
            candidates = candidateResult.content,
            tagCounts = getPublicTagCounts(),
            page = safePage,
            pageSize = safePageSize,
            candidateTotalElements = candidateResult.totalElements,
        )
    }

    fun findPagedByKwForAdmin(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Post> =
        findAndHydratePagedPosts(page, pageSize) {
            postRepository.findQPagedByKwForAdmin(
                PostRepositoryPort.PagedQuery(
                    kw = kw,
                    zeroBasedPage = page - 1,
                    pageSize = pageSize,
                    sortProperty = sort.property,
                    sortAscending = sort.isAsc,
                ),
            )
        }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    fun findDeletedPagedByKwForAdmin(
        kw: String,
        page: Int,
        pageSize: Int,
    ): PagedResult<AdmDeletedPostDto> {
        val pageResult =
            postRepository.findDeletedPagedByKw(
                PostRepositoryPort.DeletedPagedQuery(
                    kw = kw,
                    zeroBasedPage = page - 1,
                    pageSize = pageSize,
                ),
            )
        return PagedResult(
            content = pageResult.content,
            page = page,
            pageSize = pageSize,
            totalElements = pageResult.totalElements,
        )
    }

    /**
     * 삭제/복구 흐름을 처리하고 연관 데이터 정합성을 함께 보정합니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    @Transactional
    fun restoreDeletedByIdForAdmin(id: Long): Post {
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

        val restoredPost =
            postRepository.findById(id).getOrNull()
                ?: throw AppException("404-1", "복구된 글을 확인할 수 없습니다.")
        val restoredTags = extractNormalizedTags(restoredPost.content)
        val isPublic = isPubliclyListed(restoredPost)
        clearReadCaches(
            postId = id,
            afterTags = restoredTags,
            evictHotReadPages = isPublic,
            evictSearchFirstPage = isPublic,
            evictImpactedTagPages = isPublic,
            evictTagsPublic = isPublic,
            evictDetail = isPublic,
            evictReason = "restore",
        )
        if (isPublic) {
            postRecommendFeatureStoreService.refresh(restoredPost)
        } else {
            postRecommendFeatureStoreService.evict(restoredPost.id)
        }

        return restoredPost
    }

    /**
     * hardDeleteDeletedByIdForAdmin 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    @Transactional
    fun hardDeleteDeletedByIdForAdmin(id: Long) {
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

        clearReadCaches(
            postId = id,
            beforeTags = extractNormalizedTags(snapshot.content),
            afterTags = emptyList(),
            evictHotReadPages = true,
            evictSearchFirstPage = true,
            evictImpactedTagPages = true,
            evictTagsPublic = true,
            evictDetail = true,
            evictReason = "hard-delete",
        )
        postRecommendFeatureStoreService.evict(id)
    }

    fun findPagedByAuthor(
        author: Member,
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Post> =
        findAndHydratePagedPosts(page, pageSize) {
            postRepository.findQPagedByAuthorAndKw(
                toPersistenceMember(author),
                PostRepositoryPort.PagedQuery(
                    kw = kw,
                    zeroBasedPage = page - 1,
                    pageSize = pageSize,
                    sortProperty = sort.property,
                    sortAscending = sort.isAsc,
                ),
            )
        }

    fun findPagedByKwAndTag(
        kw: String,
        tag: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Post> =
        findAndHydratePagedPosts(page, pageSize) {
            postRepository.findQPagedByKwAndTag(
                PostRepositoryPort.TaggedPagedQuery(
                    kw = kw,
                    tag = tag,
                    zeroBasedPage = page - 1,
                    pageSize = pageSize,
                    sortProperty = sort.property,
                    sortAscending = sort.isAsc,
                ),
            )
        }

    fun findPublicByCursor(
        cursorCreatedAt: Instant?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post> =
        findAndHydratePublicCursorPosts {
            postRepository.findPublicByCursor(
                PostRepositoryPort.CursorQuery(
                    cursorCreatedAt = cursorCreatedAt,
                    cursorId = cursorId,
                    limit = limit,
                    sortAscending = sort.isAsc,
                ),
            )
        }

    fun findPublicByTagCursor(
        tag: String,
        cursorCreatedAt: Instant?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post> =
        findAndHydratePublicCursorPosts {
            postRepository.findPublicByTagCursor(
                PostRepositoryPort.TaggedCursorQuery(
                    tag = tag,
                    cursorCreatedAt = cursorCreatedAt,
                    cursorId = cursorId,
                    limit = limit,
                    sortAscending = sort.isAsc,
                ),
            )
        }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    fun getPublicTagCounts(): List<TagCountDto> {
        val now = System.currentTimeMillis()
        publicTagCountsCache?.takeIf { it.expiresAtMillis > now }?.let { return it.values }

        synchronized(this) {
            val refreshedNow = System.currentTimeMillis()
            publicTagCountsCache?.takeIf { it.expiresAtMillis > refreshedNow }?.let { return it.values }

            val result =
                runCatching {
                    postTagIndexRepository.findAllPublicTagCounts().map { row ->
                        TagCountDto(row.tag, row.count)
                    }
                }.getOrElse { exception ->
                    logger.warn(
                        "public_tag_counts_query_failed: fallback to legacy metaTagsIndex path",
                        exception,
                    )
                    loadPublicTagCountsFromMetaTagIndex()
                }

            publicTagCountsCache = TagCountsCache(refreshedNow + tagCacheTtlMillis, result)
            return result
        }
    }

    fun findTemp(author: Member): Post? {
        val persistenceAuthor = toPersistenceMember(author)
        return resolveTrackedTempPost(persistenceAuthor) ?: findLegacyTemp(persistenceAuthor)
    }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    @Transactional
    fun getOrCreateTemp(author: Member): Pair<Post, Boolean> {
        val persistenceAuthor = toPersistenceMember(author)
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

    private fun findAndHydratePagedPosts(
        page: Int,
        pageSize: Int,
        loader: () -> PostRepositoryPort.PagedResult<Post>,
    ): PagedResult<Post> {
        val pageResult = loader()
        hydratePostAttrs(pageResult.content)
        hydrateMembersProfileImgAttrs(pageResult.content.map { it.author })
        return PagedResult(
            content = pageResult.content,
            page = page,
            pageSize = pageSize,
            totalElements = pageResult.totalElements,
        )
    }

    private fun findAndHydratePublicCursorPosts(loader: () -> List<Post>): List<Post> {
        val posts = loader()
        if (posts.isEmpty()) return posts
        hydratePostAttrs(posts)
        hydrateMembersProfileImgAttrs(posts.map { it.author })
        return posts
    }

    private fun hydratePostAttrs(post: Post) {
        post.likesCountAttr ?: postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)?.let { post.likesCountAttr = it }
        post.commentsCountAttr ?: postAttrRepository.findBySubjectAndName(post, COMMENTS_COUNT)?.let { post.commentsCountAttr = it }
        post.hitCountAttr ?: postAttrRepository.findBySubjectAndName(post, HIT_COUNT)?.let { post.hitCountAttr = it }
    }

    /**
     * hydratePostAttrs 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
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

    /**
     * hydrateMembersProfileImgAttrs 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
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

    private fun findLegacyTemp(author: Member): Post? =
        postRepository.findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(author, "임시글")

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

    private fun updateTempDraftMarker(
        author: Member,
        postId: Long?,
    ) {
        val attr =
            memberAttrRepository.findBySubjectAndName(author, activeTempDraftPostIdAttrName)
                ?: MemberAttr(0, author, activeTempDraftPostIdAttrName, "")
        attr.strValue = postId?.toString().orEmpty()
        saveMemberAttr(attr)
    }

    private fun tryAcquireTempDraftLock(author: Member): Boolean {
        val lockValue = memberAttrRepository.incrementIntValue(author, activeTempDraftLockAttrName, 1)
        if (lockValue == 1) return true
        memberAttrRepository.incrementIntValue(author, activeTempDraftLockAttrName, -1)
        return false
    }

    private fun releaseTempDraftLock(author: Member) {
        memberAttrRepository.incrementIntValue(author, activeTempDraftLockAttrName, -1)
    }

    // SecurityContext actor는 MemberProxy일 수 있어 영속 경계에서는 실제 엔티티를 사용한다.
    private fun toPersistenceMember(member: Member): Member = if (member is MemberProxy) member.persistenceMember else member

    private fun clearReadCaches(
        postId: Long? = null,
        beforeTags: Collection<String> = emptyList(),
        afterTags: Collection<String> = emptyList(),
        evictHotReadPages: Boolean = true,
        evictSearchFirstPage: Boolean = true,
        evictImpactedTagPages: Boolean = true,
        evictTagsPublic: Boolean = true,
        evictDetail: Boolean = true,
        evictReason: String = "unknown",
    ) {
        if (evictTagsPublic) {
            publicTagCountsCache = null
            recordCacheEvict("local-tag-counts", "clear", evictReason)
        }
        val feedCache = cacheManager.getCache(PostQueryCacheNames.FEED)
        val exploreCache = cacheManager.getCache(PostQueryCacheNames.EXPLORE)
        val feedCursorFirstCache = cacheManager.getCache(PostQueryCacheNames.FEED_CURSOR_FIRST)
        val exploreCursorFirstCache = cacheManager.getCache(PostQueryCacheNames.EXPLORE_CURSOR_FIRST)
        val searchCache = cacheManager.getCache(PostQueryCacheNames.SEARCH)
        val searchNegativeCache = cacheManager.getCache(PostQueryCacheNames.SEARCH_NEGATIVE)
        val tagsCache = cacheManager.getCache(PostQueryCacheNames.TAGS)

        if (evictHotReadPages || evictSearchFirstPage) {
            hotPageSizes.forEach { pageSize ->
                hotSorts.forEach { sort ->
                    val sortName = sort.name
                    if (evictHotReadPages) {
                        feedCache?.evict("page=1:size=$pageSize:sort=$sortName")
                        recordCacheEvict(PostQueryCacheNames.FEED, "key", evictReason)
                        exploreCache?.evict("page=1:size=$pageSize:sort=$sortName:kw=_:tag=_")
                        recordCacheEvict(PostQueryCacheNames.EXPLORE, "key", evictReason)
                        feedCursorFirstCache?.evict("size=$pageSize:sort=$sortName")
                        recordCacheEvict(PostQueryCacheNames.FEED_CURSOR_FIRST, "key", evictReason)
                        exploreCursorFirstCache?.evict("size=$pageSize:sort=$sortName:tag=_")
                        recordCacheEvict(PostQueryCacheNames.EXPLORE_CURSOR_FIRST, "key", evictReason)
                    }
                    if (evictSearchFirstPage) {
                        searchCache?.evict("page=1:size=$pageSize:sort=$sortName:kw=_")
                        recordCacheEvict(PostQueryCacheNames.SEARCH, "key", evictReason)
                        searchNegativeCache?.evict("page=1:size=$pageSize:sort=$sortName:kw=_")
                        recordCacheEvict(PostQueryCacheNames.SEARCH_NEGATIVE, "key", evictReason)
                    }
                }
            }
        }

        if (evictImpactedTagPages) {
            val impactedTagTokens =
                buildList(beforeTags.size + afterTags.size) {
                    addAll(beforeTags)
                    addAll(afterTags)
                }.asSequence()
                    .map(String::trim)
                    .filter(String::isNotBlank)
                    .map(PostPublicReadQueryService::toCacheKeyToken)
                    .distinct()
                    .take(maxTagCacheEvict)
                    .toList()

            impactedTagTokens.forEach { token ->
                hotPageSizes.forEach { pageSize ->
                    hotSorts.forEach { sort ->
                        val sortName = sort.name
                        exploreCache?.evict("page=1:size=$pageSize:sort=$sortName:kw=_:tag=$token")
                        recordCacheEvict(PostQueryCacheNames.EXPLORE, "key", evictReason)
                        exploreCursorFirstCache?.evict("size=$pageSize:sort=$sortName:tag=$token")
                        recordCacheEvict(PostQueryCacheNames.EXPLORE_CURSOR_FIRST, "key", evictReason)
                    }
                }
            }
        }

        if (evictTagsPublic) {
            tagsCache?.evict("public")
            recordCacheEvict(PostQueryCacheNames.TAGS, "key", evictReason)
        }
        if (evictDetail) {
            val detailMetaCache = cacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_META)
            val detailContentCache = cacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT)
            val detailNegativeCache = cacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE)
            if (postId == null) {
                detailMetaCache?.clear()
                recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_META, "clear", evictReason)
                detailContentCache?.clear()
                recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, "clear", evictReason)
                detailNegativeCache?.clear()
                recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE, "clear", evictReason)
            } else {
                detailMetaCache?.evict(postId)
                recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_META, "key", evictReason)
                detailContentCache?.evict(postId)
                recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, "key", evictReason)
                detailNegativeCache?.evict(postId)
                recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE, "key", evictReason)
            }
        }
    }

    private fun recordCacheEvict(
        cacheName: String,
        scope: String,
        reason: String,
    ) {
        meterRegistry?.counter("post.read.cache.evict", "cache", cacheName, "scope", scope, "reason", reason)?.increment()
    }

    private fun isPubliclyListed(post: Post): Boolean = post.published && post.listed

    private fun refreshRecommendFeatureStoreForPublicPost(post: Post) {
        if (!isPubliclyListed(post)) return
        runCatching {
            postRecommendFeatureStoreService.refresh(post)
        }.onFailure { exception ->
            logger.warn("recommend_feature_store_refresh_failed postId={}", post.id, exception)
        }
    }

    /**
     * syncMetaTagIndexAttr 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun syncMetaTagIndexAttr(post: Post) {
        val normalizedTags = extractNormalizedTags(post.content)

        val indexValue =
            if (normalizedTags.isEmpty()) {
                ""
            } else {
                normalizedTags.joinToString(separator = "|", prefix = "|", postfix = "|")
            }

        val tagIndexAttr = postAttrRepository.findBySubjectAndName(post, META_TAGS_INDEX) ?: PostAttr(0, post, META_TAGS_INDEX, "")
        if ((tagIndexAttr.strValue ?: "") != indexValue) {
            tagIndexAttr.strValue = indexValue
            postAttrRepository.save(tagIndexAttr)
        }

        runCatching {
            postTagIndexRepository.replacePostTags(post.id, normalizedTags)
        }.onFailure { exception ->
            logger.warn("failed_to_sync_post_tag_index postId={}", post.id, exception)
        }
    }

    private fun loadPublicTagCountsFromMetaTagIndex(): List<TagCountDto> {
        val tagCounts = ConcurrentHashMap<String, Int>()
        val indexedTagRows = postRepository.findAllPublicListedTagIndexes(META_TAGS_INDEX)

        indexedTagRows.forEach { tagIndex ->
            parseTagIndex(tagIndex).forEach { normalizedTag ->
                tagCounts.merge(normalizedTag, 1, Int::plus)
            }
        }

        if (indexedTagRows.isEmpty()) {
            logger.warn(
                "public_tag_counts_index_empty: skip legacy content-scan fallback to protect DB under load",
            )
        }

        return tagCounts
            .entries
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key.lowercase() })
            .map { TagCountDto(it.key, it.value) }
    }

    private fun normalizeTag(tag: String): String = tag.trim()

    private fun extractNormalizedTags(content: String): List<String> =
        PostMetaExtractor
            .extract(content)
            .tags
            .map(::normalizeTag)
            .filter(String::isNotBlank)
            .distinct()

    private fun parseTagIndex(tagIndex: String): List<String> =
        tagIndex
            .split('|')
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
}
