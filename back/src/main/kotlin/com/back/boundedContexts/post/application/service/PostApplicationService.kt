package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostWriteRequestIdempotencyRepositoryPort
import com.back.boundedContexts.post.application.port.output.SecureTipPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.domain.PostWriteRequestIdempotency
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.boundedContexts.post.event.PostAccountDeletionDeletedEvent
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.exception.application.AppException
import com.back.global.security.application.HtmlContentSanitizer
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.task.application.TaskFacade
import com.back.standard.dto.EventPayload
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.orm.ObjectOptimisticLockingFailureException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID
import kotlin.jvm.optionals.getOrNull

@Service
class PostApplicationService(
    private val postRepository: PostRepositoryPort,
    private val postWriteRequestIdempotencyRepository: PostWriteRequestIdempotencyRepositoryPort,
    private val secureTipPort: SecureTipPort,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
    private val postRecommendRankingService: PostRecommendRankingService,
    private val postKeywordSearchPipelineService: PostKeywordSearchPipelineService,
    private val taskFacade: TaskFacade,
    private val objectMapper: ObjectMapper,
    private val postHydrationService: PostHydrationService,
    private val postCounterService: PostCounterService,
    private val postTagIndexService: PostTagIndexService,
    private val postTempDraftService: PostTempDraftService,
    private val postCommentApplicationService: PostCommentApplicationService,
    private val postLikeApplicationService: PostLikeApplicationService,
) {
    private val logger = LoggerFactory.getLogger(PostApplicationService::class.java)

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
        val persistenceAuthor = author.toPersistenceMember()
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
            val createdTags = postTagIndexService.extractNormalizedTags(created.content)
            val isPublic = isPubliclyListed(created)
            publishPostWriteAfterCommitEvent(
                PostWriteSideEffectCommand(
                    postId = created.id,
                    previousContent = null,
                    currentContent = created.content,
                    deletedContent = null,
                    beforeTags = emptyList(),
                    afterTags = createdTags,
                    cacheInvalidationScope =
                        if (isPublic) {
                            PostReadCacheInvalidationScope.PublicPostCreated
                        } else {
                            PostReadCacheInvalidationScope.None
                        },
                    evictReason = "write",
                    recommendationAction = recommendationActionFor(isPublic),
                ),
                PostWrittenEvent(
                    UUID.randomUUID(),
                    PostDto(created),
                    MemberDto(author),
                    emptyList(),
                    createdTags,
                ),
            )
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
        val createdTags = postTagIndexService.extractNormalizedTags(createdPost.content)
        val isPublic = isPubliclyListed(createdPost)
        publishPostWriteAfterCommitEvent(
            PostWriteSideEffectCommand(
                postId = createdPost.id,
                previousContent = null,
                currentContent = createdPost.content,
                deletedContent = null,
                beforeTags = emptyList(),
                afterTags = createdTags,
                cacheInvalidationScope =
                    if (isPublic) {
                        PostReadCacheInvalidationScope.PublicPostCreated
                    } else {
                        PostReadCacheInvalidationScope.None
                    },
                evictReason = "write-idempotent",
                recommendationAction = recommendationActionFor(isPublic),
            ),
            PostWrittenEvent(
                UUID.randomUUID(),
                PostDto(createdPost),
                MemberDto(author),
                emptyList(),
                createdTags,
            ),
        )

        return createdPost
    }

    fun findById(id: Long): Post? =
        postRepository
            .findById(id)
            .getOrNull()
            ?.also { post ->
                postHydrationService.hydratePostAttrs(post)
                postHydrationService.hydrateMembersProfileImgAttrs(listOf(post.author))
            }

    fun findPublicDetailById(id: Long): Post? =
        postRepository
            .findPublicDetailById(id)
            ?.also { post ->
                if (post.likesCountAttr == null || post.commentsCountAttr == null || post.hitCountAttr == null) {
                    postHydrationService.hydratePostAttrs(post)
                }
                postHydrationService.hydrateMembersProfileImgAttrs(listOf(post.author))
            }

    fun findPublicDetailContentById(id: Long): PublicPostDetailContentCacheDto? = postRepository.findPublicDetailContentById(id)

    fun findLatest(): Post? = postRepository.findFirstByOrderByIdDesc()

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
        postHydrationService.hydratePostAttrs(post)
        val currentVersion = post.version ?: 0L
        val wasTempDraft = postTempDraftService.isTempDraft(post)
        if (expectedVersion != currentVersion) {
            throw AppException("409-1", "다른 세션에서 이미 수정되었습니다. 최신 글을 다시 불러온 뒤 수정해주세요.")
        }

        val previousTitle = post.title
        val previousContent = post.content
        val previousContentHtml = post.contentHtml
        val wasPublic = isPubliclyListed(post)
        val previousTags = postTagIndexService.extractNormalizedTags(previousContent)
        try {
            val sanitizedContentHtml =
                if (contentHtml == null) {
                    post.contentHtml
                } else {
                    HtmlContentSanitizer.sanitizeRichHtmlOrNull(contentHtml)
                }
            post.modify(title, content, published, listed, sanitizedContentHtml)
            postRepository.flush()
            postTagIndexService.syncMetaTagIndexAttr(post)
            if (wasTempDraft) {
                postTempDraftService.updateTempDraftMarker(post.author, null)
            }
        } catch (exception: ObjectOptimisticLockingFailureException) {
            logger.warn(
                "post_modify_optimistic_lock_conflict postId={} expectedVersion={} currentVersion={}",
                post.id,
                expectedVersion,
                currentVersion,
                exception,
            )
            throw AppException("409-1", "다른 세션에서 이미 수정되었습니다. 최신 글을 다시 불러온 뒤 수정해주세요.")
        }
        val afterTags = postTagIndexService.extractNormalizedTags(post.content)
        val isPublic = isPubliclyListed(post)
        val listingVisibilityChanged = wasPublic != isPublic
        val contentChanged = previousContent != post.content
        val contentHtmlChanged = previousContentHtml != post.contentHtml
        val titleChanged = previousTitle != post.title
        val tagChanged = previousTags != afterTags
        val affectsPublicRead = wasPublic || isPublic
        publishPostWriteAfterCommitEvent(
            PostWriteSideEffectCommand(
                postId = post.id,
                previousContent = previousContent,
                currentContent = post.content,
                deletedContent = null,
                beforeTags = previousTags,
                afterTags = afterTags,
                cacheInvalidationScope =
                    if (affectsPublicRead) {
                        PostReadCacheInvalidationScope.PublicPostModified(
                            buildPublicPostChangeImpacts(
                                listingVisibilityChanged = listingVisibilityChanged,
                                titleChanged = titleChanged,
                                contentChanged = contentChanged || contentHtmlChanged,
                                tagChanged = tagChanged,
                            ),
                        )
                    } else {
                        PostReadCacheInvalidationScope.None
                    },
                evictReason = "modify",
                recommendationAction = recommendationActionFor(isPublic),
            ),
            PostModifiedEvent(
                UUID.randomUUID(),
                PostDto(post),
                MemberDto(actor),
                previousTags,
                afterTags,
            ),
        )
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
        postTagIndexService.syncMetaTagIndexAttr(savedPost)
        postCounterService.incrementMemberPostsCount(persistenceAuthor)
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
        val wasPublic = isPubliclyListed(post)
        val wasTempDraft = postTempDraftService.isTempDraft(post)
        val beforeTags = postTagIndexService.extractNormalizedTags(deletedPostContent)

        val softDeleted = postRepository.softDeleteById(post.id)
        if (!softDeleted) {
            throw AppException("404-1", "${post.id}번 글을 찾을 수 없습니다.")
        }
        if (wasTempDraft) {
            postTempDraftService.updateTempDraftMarker(post.author, null)
        }
        // 카운터 보정 실패는 삭제 실패로 전파하지 않는다. 실패 시 실제 개수 재동기화를 시도한다.
        runCatching {
            postCounterService.decrementMemberPostsCount(Member(post.author.id))
        }.onFailure { exception ->
            logger.warn("Failed to decrement member posts counter for member id={}", post.author.id, exception)
            runCatching {
                postCounterService.reconcileMemberPostsCount(Member(post.author.id))
            }.onFailure { reconcileException ->
                logger.warn("Failed to reconcile member posts counter for member id={}", post.author.id, reconcileException)
            }
        }

        publishPostWriteAfterCommitEvent(
            PostWriteSideEffectCommand(
                postId = post.id,
                previousContent = null,
                currentContent = null,
                deletedContent = deletedPostContent,
                beforeTags = beforeTags,
                afterTags = emptyList(),
                cacheInvalidationScope =
                    if (wasPublic) {
                        PostReadCacheInvalidationScope.PublicPostDeleted
                    } else {
                        PostReadCacheInvalidationScope.None
                    },
                evictReason = "soft-delete",
                recommendationAction = PostRecommendationSideEffect.EVICT,
            ),
            PostDeletedEvent(
                UUID.randomUUID(),
                PostDto(post),
                MemberDto(actor),
                beforeTags,
                emptyList(),
            ),
        )
    }

    @Transactional
    fun deleteContentByAuthorForAccountDeletion(author: Member) {
        postCommentApplicationService.deleteCommentsByAuthorForAccountDeletion(author)
        val posts = postRepository.findByAuthorIdOrderByIdAsc(author.id)

        posts.forEach { post ->
            deleteForAccountDeletion(post)
        }
    }

    private fun deleteForAccountDeletion(post: Post) {
        val deletedPostContent = post.content
        val wasPublic = isPubliclyListed(post)
        val wasTempDraft = postTempDraftService.isTempDraft(post)
        val beforeTags = postTagIndexService.extractNormalizedTags(deletedPostContent)

        val softDeleted = postRepository.softDeleteById(post.id)
        if (!softDeleted) {
            throw AppException("404-1", "${post.id}번 글을 찾을 수 없습니다.")
        }
        if (wasTempDraft) {
            postTempDraftService.updateTempDraftMarker(post.author, null)
        }
        runCatching {
            postCounterService.decrementMemberPostsCount(Member(post.author.id))
        }.onFailure { exception ->
            logger.warn("Failed to decrement member posts counter for member id={}", post.author.id, exception)
            runCatching {
                postCounterService.reconcileMemberPostsCount(Member(post.author.id))
            }.onFailure { reconcileException ->
                logger.warn("Failed to reconcile member posts counter for member id={}", post.author.id, reconcileException)
            }
        }
        uploadedFileRetentionService.scheduleDeletedPostAttachments(deletedPostContent)

        publishPostWriteAfterCommitEvent(
            PostWriteSideEffectCommand(
                postId = post.id,
                previousContent = null,
                currentContent = null,
                deletedContent = null,
                beforeTags = beforeTags,
                afterTags = emptyList(),
                cacheInvalidationScope =
                    if (wasPublic) {
                        PostReadCacheInvalidationScope.PublicPostDeleted
                    } else {
                        PostReadCacheInvalidationScope.None
                    },
                evictReason = "account-deletion-soft-delete",
                recommendationAction = PostRecommendationSideEffect.EVICT,
            ),
            PostAccountDeletionDeletedEvent(
                uid = UUID.randomUUID(),
                aggregateId = post.id,
                beforeTags = beforeTags,
                afterTags = emptyList(),
            ),
        )
    }

    @Transactional
    fun writeComment(
        author: Member,
        post: Post,
        content: String,
        parentComment: PostComment? = null,
    ): PostComment = postCommentApplicationService.writeComment(author, post, content, parentComment)

    @Transactional
    fun modifyComment(
        postComment: PostComment,
        actor: Member,
        content: String,
    ) = postCommentApplicationService.modifyComment(postComment, actor, content)

    @Transactional
    fun deleteComment(
        post: Post,
        postComment: PostComment,
        actor: Member,
    ) = postCommentApplicationService.deleteComment(post, postComment, actor)

    @Transactional
    fun like(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult = postLikeApplicationService.like(post, actor)

    @Transactional
    fun unlike(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult = postLikeApplicationService.unlike(post, actor)

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun reconcileLikeState(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult = postLikeApplicationService.reconcileLikeState(post, actor)

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    fun readLikeSnapshot(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult = postLikeApplicationService.readLikeSnapshot(post, actor)

    @Transactional
    fun incrementHit(post: Post) = postCounterService.incrementHit(post)

    fun getComments(
        post: Post,
        limit: Int,
    ): List<PostComment> = postCommentApplicationService.getComments(post, limit)

    fun findCommentById(
        post: Post,
        id: Long,
    ): PostComment? = postCommentApplicationService.findCommentById(post, id)

    fun isLiked(
        post: Post,
        liker: Member?,
    ): Boolean = postLikeApplicationService.isLiked(post, liker)

    fun findLikedPostIds(
        liker: Member?,
        posts: List<Post>,
    ): Set<Long> = postLikeApplicationService.findLikedPostIds(liker, posts)

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
            postCounterService.incrementMemberPostsCount(authorRef)
        }.onFailure { exception ->
            logger.warn("Failed to increment member posts counter for member id={}", snapshot.authorId, exception)
            runCatching {
                postCounterService.reconcileMemberPostsCount(authorRef)
            }.onFailure { reconcileException ->
                logger.warn("Failed to reconcile member posts counter for member id={}", snapshot.authorId, reconcileException)
            }
        }

        runCatching {
            uploadedFileRetentionService.restoreDeletedPostAttachments(
                postId = id,
                content = snapshot.content,
            )
        }.onFailure { exception ->
            logger.warn("Failed to restore attachments for restored post id={}", id, exception)
        }

        val restoredPost =
            postRepository.findById(id).getOrNull()
                ?: throw AppException("404-1", "복구된 글을 확인할 수 없습니다.")
        val restoredTags = postTagIndexService.extractNormalizedTags(restoredPost.content)
        val isPublic = isPubliclyListed(restoredPost)
        publishPostWriteAfterCommitEvent(
            PostWriteSideEffectCommand(
                postId = id,
                previousContent = null,
                currentContent = null,
                deletedContent = null,
                beforeTags = emptyList(),
                afterTags = restoredTags,
                cacheInvalidationScope =
                    if (isPublic) {
                        PostReadCacheInvalidationScope.PublicPostRestored
                    } else {
                        PostReadCacheInvalidationScope.None
                    },
                evictReason = "restore",
                recommendationAction = recommendationActionFor(isPublic),
            ),
        )

        return restoredPost
    }

    @Transactional
    fun hardDeleteDeletedByIdForAdmin(id: Long) {
        val snapshot =
            postRepository.findDeletedSnapshotById(id)
                ?: throw AppException("404-1", "해당 글을 찾을 수 없습니다.")

        val hardDeleted = postRepository.hardDeleteDeletedById(id)
        if (!hardDeleted) {
            throw AppException("404-1", "이미 영구삭제되었거나 존재하지 않는 글입니다.")
        }

        publishPostWriteAfterCommitEvent(
            PostWriteSideEffectCommand(
                postId = id,
                previousContent = null,
                currentContent = null,
                deletedContent = snapshot.content,
                beforeTags = postTagIndexService.extractNormalizedTags(snapshot.content),
                afterTags = emptyList(),
                cacheInvalidationScope =
                    if (snapshot.published && snapshot.listed) {
                        PostReadCacheInvalidationScope.PublicPostHardDeleted
                    } else {
                        PostReadCacheInvalidationScope.None
                    },
                evictReason = "hard-delete",
                recommendationAction = PostRecommendationSideEffect.EVICT,
            ),
        )
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
                author.toPersistenceMember(),
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

    fun findPublicByAuthorExceptPost(
        authorId: Long,
        excludePostId: Long?,
        limit: Int,
    ): List<Post> {
        val safeAuthorId = authorId.coerceAtLeast(0L)
        if (safeAuthorId <= 0L) return emptyList()
        val safeExcludePostId = excludePostId?.takeIf { it > 0L }
        val safeLimit = limit.coerceIn(1, 12)
        return findAndHydratePublicCursorPosts {
            postRepository.findPublicByAuthorExceptPost(
                PostRepositoryPort.RelatedAuthorQuery(
                    authorId = safeAuthorId,
                    excludePostId = safeExcludePostId,
                    limit = safeLimit,
                ),
            )
        }
    }

    fun getPublicTagCounts(): List<TagCountDto> = postTagIndexService.getPublicTagCounts()

    fun findTemp(author: Member): Post? = postTempDraftService.findTemp(author)

    @Transactional
    fun getOrCreateTemp(author: Member): Pair<Post, Boolean> = postTempDraftService.getOrCreateTemp(author)

    fun isTempDraft(post: Post): Boolean = postTempDraftService.isTempDraft(post)

    private fun findAndHydratePagedPosts(
        page: Int,
        pageSize: Int,
        loader: () -> PostRepositoryPort.PagedResult<Post>,
    ): PagedResult<Post> {
        val pageResult = loader()
        postHydrationService.hydratePostAttrs(pageResult.content)
        postHydrationService.hydrateMembersProfileImgAttrs(pageResult.content.map { it.author })
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
        postHydrationService.hydratePostAttrs(posts)
        postHydrationService.hydrateMembersProfileImgAttrs(posts.map { it.author })
        return posts
    }

    private fun recommendationActionFor(isPublic: Boolean): PostRecommendationSideEffect =
        if (isPublic) PostRecommendationSideEffect.REFRESH else PostRecommendationSideEffect.EVICT

    private fun publishPostWriteAfterCommitEvent(
        command: PostWriteSideEffectCommand,
        domainEvent: EventPayload? = null,
    ) {
        if (command.cacheInvalidationScope.evictsPublicTags()) {
            postTagIndexService.evictPublicTagCountsCache()
        }
        taskFacade.addToQueue(command.toTaskPayload(domainEvent), inlineWhenEnabled = false)
    }

    private fun PostWriteSideEffectCommand.toTaskPayload(domainEvent: EventPayload?): PostWriteSideEffectPayload =
        PostWriteSideEffectPayload(
            uid = postWriteSideEffectTaskUid(this, domainEvent),
            aggregateType = domainEvent?.aggregateType ?: "Post",
            aggregateId = postId,
            postId = postId,
            previousContent = previousContent,
            currentContent = currentContent,
            deletedContent = deletedContent,
            beforeTags = beforeTags,
            afterTags = afterTags,
            cacheInvalidationTargets = cacheInvalidationScope.targets(),
            evictReason = evictReason,
            recommendationAction = recommendationAction,
            domainEventType = domainEvent?.javaClass?.name,
            domainEventJson = domainEvent?.let(objectMapper::writeValueAsString),
        )

    private fun postWriteSideEffectTaskUid(
        command: PostWriteSideEffectCommand,
        domainEvent: EventPayload?,
    ): UUID {
        domainEvent?.uid?.let { eventUid ->
            return UUID.nameUUIDFromBytes(
                "${PostWriteSideEffectPayload.TASK_TYPE}:$eventUid".toByteArray(StandardCharsets.UTF_8),
            )
        }

        return command.operationUid
    }

    private fun buildPublicPostChangeImpacts(
        listingVisibilityChanged: Boolean,
        titleChanged: Boolean,
        contentChanged: Boolean,
        tagChanged: Boolean,
    ): Set<PostPublicChangeImpact> =
        buildSet {
            if (listingVisibilityChanged) add(PostPublicChangeImpact.LISTING_VISIBILITY)
            if (titleChanged) add(PostPublicChangeImpact.TITLE)
            if (contentChanged) add(PostPublicChangeImpact.CONTENT)
            if (tagChanged) add(PostPublicChangeImpact.TAG)
        }

    private fun isPubliclyListed(post: Post): Boolean = post.published && post.listed
}
