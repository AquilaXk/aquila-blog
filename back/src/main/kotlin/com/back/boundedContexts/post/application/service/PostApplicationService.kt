package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostWriteRequestIdempotencyRepositoryPort
import com.back.boundedContexts.post.application.port.output.SecureTipPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostWriteRequestIdempotency
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.AdmDeletedPostSnapshotDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostInteractionReadStateDto
import com.back.boundedContexts.post.dto.PostPreviewExtractor
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.boundedContexts.post.model.PostSummarySource
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.security.application.HtmlContentSanitizer
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.storage.application.UploadedFileUrlCodec
import com.back.global.task.application.TaskFacade
import com.back.standard.dto.EventPayload
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.slf4j.LoggerFactory
import org.springframework.orm.ObjectOptimisticLockingFailureException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import tools.jackson.databind.ObjectMapper
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID
import kotlin.jvm.optionals.getOrNull

@Service
class PostApplicationService(
    private val postRepository: PostRepositoryPort,
    private val postWriteRequestIdempotencyRepository: PostWriteRequestIdempotencyRepositoryPort,
    private val memberRepository: MemberRepositoryPort,
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
    private val postHitSideEffectQueue: PostHitSideEffectQueue,
    private val postReadCacheInvalidator: PostReadCacheInvalidator? = null,
) : PostUseCase {
    private val logger = LoggerFactory.getLogger(PostApplicationService::class.java)

    private data class WrittenPostResult(
        val post: Post,
        val createdTags: List<String>,
        val currentAttachmentKeys: UploadedFileUrlCodec.PartitionedObjectKeys,
    )

    override fun count(): Long = postRepository.count()

    override fun randomSecureTip(): String = secureTipPort.randomSecureTip()

    @Transactional
    override fun write(
        author: Member,
        title: String,
        content: String,
        published: Boolean,
        listed: Boolean,
        idempotencyKey: String?,
        contentHtml: String?,
        summary: String?,
        summaryMode: PostSummaryMode,
    ): Post {
        validateCreateSummaryIntent(summary, summaryMode)
        val persistenceAuthor = author
        val normalizedIdempotencyKey = idempotencyKey?.trim()?.takeIf { it.isNotBlank() }

        if (normalizedIdempotencyKey == null) {
            val written =
                writeNewPost(
                    author = author,
                    persistenceAuthor = persistenceAuthor,
                    title = title,
                    content = content,
                    published = published,
                    listed = listed,
                    contentHtml = contentHtml,
                    summary = summary,
                    summaryMode = summaryMode,
                )
            return completePostWrite(
                written.post,
                author,
                written.createdTags,
                written.currentAttachmentKeys,
            )
        }

        // 같은 작성자의 keyed 요청은 slot 조회 전에 작성자 행을 직렬화한다.
        val lockedAuthor =
            memberRepository
                .findByIdForUpdate(persistenceAuthor.id)
                .orElseThrow { AppException(ErrorCode.NOT_FOUND, "회원을 찾을 수 없습니다.") }

        val existingRequest =
            postWriteRequestIdempotencyRepository.findByActorAndRequestKey(
                lockedAuthor,
                normalizedIdempotencyKey,
            )

        if (existingRequest?.postId != null) {
            return findById(existingRequest.postId!!)
                ?: throw AppException(ErrorCode.POST_CONCURRENT_EDIT, "이전 작성 요청 결과를 확인할 수 없습니다. 다시 시도해주세요.")
        }

        val requestSlot = existingRequest ?: createIdempotencyRequestSlot(lockedAuthor, normalizedIdempotencyKey)

        val written =
            writeNewPost(
                author = lockedAuthor,
                persistenceAuthor = lockedAuthor,
                title = title,
                content = content,
                published = published,
                listed = listed,
                contentHtml = contentHtml,
                summary = summary,
                summaryMode = summaryMode,
            )

        requestSlot.postId = written.post.id
        postWriteRequestIdempotencyRepository.save(requestSlot)
        return completePostWrite(
            written.post,
            author,
            written.createdTags,
            written.currentAttachmentKeys,
            normalizedIdempotencyKey,
        )
    }

    private fun completePostWrite(
        post: Post,
        actor: Member,
        createdTags: List<String>,
        currentAttachmentKeys: UploadedFileUrlCodec.PartitionedObjectKeys,
        idempotencyKey: String? = null,
    ): Post {
        val isPublic = isPubliclyListed(post)
        enqueuePostWriteSideEffect(
            PostWriteSideEffectCommand(
                postId = post.id,
                previousContent = null,
                currentContent = post.content,
                deletedContent = null,
                beforeTags = emptyList(),
                afterTags = createdTags,
                cacheInvalidationScope =
                    resolveLifecycleCacheInvalidationScope(
                        published = post.published,
                        listed = post.listed,
                        publicScope = PostReadCacheInvalidationScope.PublicPostCreated,
                    ),
                evictReason = if (idempotencyKey == null) "write" else "write-idempotent",
                recommendationAction = recommendationActionFor(isPublic),
                preExtractedCurrentKeys = currentAttachmentKeys,
            ),
            PostWrittenEvent(
                UUID.randomUUID(),
                PostDto(post),
                MemberDto(actor),
                emptyList(),
                createdTags,
            ),
        )
        logger.info("post_create_completed postId={} actorId={}", post.id, actor.id)
        return post
    }

    override fun findById(id: Long): Post? =
        postRepository
            .findById(id)
            .getOrNull()
            ?.also { post ->
                postHydrationService.hydratePostAttrs(post)
                postHydrationService.hydrateMembersPublishedProfileWorkspaces(listOf(post.author))
            }

    override fun findPublicDetailById(id: Long): Post? =
        postRepository
            .findPublicDetailById(id)
            ?.also { post ->
                postHydrationService.hydratePostAttrs(post)
                postHydrationService.hydrateMembersPublishedProfileWorkspaces(listOf(post.author))
            }

    override fun findPublicDetailContentById(id: Long): PublicPostDetailContentCacheDto? = postRepository.findPublicDetailContentById(id)

    override fun findInteractionReadStateById(id: Long): PostInteractionReadStateDto? = postRepository.findInteractionReadStateById(id)

    override fun isPublicDetailReadable(id: Long): Boolean = postRepository.isPublicDetailReadable(id)

    override fun findLatest(): Post? = postRepository.findFirstByOrderByIdDesc()

    @Transactional
    override fun modify(
        actor: Member,
        post: Post,
        title: String,
        content: String,
        published: Boolean?,
        listed: Boolean?,
        expectedVersion: Long,
        contentHtml: String?,
        summary: String?,
        summaryMode: PostSummaryMode?,
    ) {
        postHydrationService.hydratePostAttrs(post)
        val currentVersion = post.version ?: 0L
        val wasTempDraft = postTempDraftService.isTempDraft(post)
        if (expectedVersion != currentVersion) {
            throw AppException(ErrorCode.POST_CONCURRENT_EDIT, "다른 세션에서 이미 수정되었습니다. 최신 글을 다시 불러온 뒤 수정해주세요.")
        }

        val previousTitle = post.title
        val previousContent = post.content
        val previousContentHtml = post.contentHtml
        val previousContentHtmlHash = post.contentHtmlHash
        val previousContentHtmlSanitizerPolicyVersion = post.contentHtmlSanitizerPolicyVersion
        val previousContentHtmlTrustState = post.contentHtmlTrustState
        val previousSummaryText = post.summaryText
        val previousSummarySource = post.summarySource
        val wasPublic = isPubliclyListed(post)
        val wasPublished = post.published
        val previousTags = postTagIndexService.extractNormalizedTags(previousContent)
        val thumbnail = PostPreviewExtractor.extractThumbnail(content)
        val afterTags: List<String>
        val currentAttachmentKeys: UploadedFileUrlCodec.PartitionedObjectKeys
        try {
            val contentHtmlTrust =
                if (contentHtml == null) {
                    null
                } else {
                    HtmlContentSanitizer.sanitizeForPersistence(contentHtml)
                }
            if (contentHtmlTrust == null) {
                post.modify(title, content, published, listed, thumbnail = thumbnail)
            } else {
                post.modify(
                    title = title,
                    content = content,
                    published = published,
                    listed = listed,
                    contentHtml = contentHtmlTrust.contentHtml,
                    contentHtmlHash = contentHtmlTrust.contentHtmlHash,
                    contentHtmlSanitizerPolicyVersion = contentHtmlTrust.contentHtmlSanitizerPolicyVersion,
                    contentHtmlTrustState = contentHtmlTrust.contentHtmlTrustState,
                    thumbnail = thumbnail,
                )
            }
            resolveModifiedSummary(
                title = title,
                content = content,
                previousTitle = previousTitle,
                previousContent = previousContent,
                previousSummaryText = previousSummaryText,
                previousSummarySource = previousSummarySource,
                submittedSummary = summary,
                requestedMode = summaryMode,
            )?.let { resolved -> post.applyResolvedSummary(resolved) }
            postRepository.flush()
            afterTags = postTagIndexService.syncPostTags(post)
            currentAttachmentKeys = UploadedFileUrlCodec.extractPartitionedObjectKeysFromContent(post.content)
            postRepository.syncImageReferences(
                post.id,
                currentAttachmentKeys.allKeys(),
            )
            if (wasTempDraft) {
                post.isTempDraft = false
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
            throw AppException(ErrorCode.POST_CONCURRENT_EDIT, "다른 세션에서 이미 수정되었습니다. 최신 글을 다시 불러온 뒤 수정해주세요.")
        }
        val isPublic = isPubliclyListed(post)
        val listingVisibilityChanged = wasPublic != isPublic
        val contentChanged = previousContent != post.content
        val contentHtmlChanged =
            previousContentHtml != post.contentHtml ||
                previousContentHtmlHash != post.contentHtmlHash ||
                previousContentHtmlSanitizerPolicyVersion != post.contentHtmlSanitizerPolicyVersion ||
                previousContentHtmlTrustState != post.contentHtmlTrustState
        val titleChanged = previousTitle != post.title
        val summaryChanged = previousSummaryText != post.summaryText || previousSummarySource != post.summarySource
        val tagChanged = previousTags != afterTags
        val affectsPublicRead = wasPublic || isPublic
        enqueuePostWriteSideEffect(
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
                                summaryChanged = summaryChanged,
                            ),
                        )
                    } else if (wasPublished || post.published) {
                        PostReadCacheInvalidationScope.AdminPostListAndDetail
                    } else {
                        PostReadCacheInvalidationScope.AdminPostListOnly
                    },
                evictReason = "modify",
                recommendationAction = recommendationActionFor(isPublic),
                preExtractedCurrentKeys = currentAttachmentKeys,
            ),
            PostModifiedEvent(
                UUID.randomUUID(),
                PostDto(post),
                MemberDto(actor),
                previousTags,
                afterTags,
                wasPublic = wasPublished,
            ),
        )
        logger.info("post_update_completed postId={} actorId={}", post.id, actor.id)
    }

    private fun writeNewPost(
        author: Member,
        persistenceAuthor: Member,
        title: String,
        content: String,
        published: Boolean,
        listed: Boolean,
        contentHtml: String?,
        summary: String?,
        summaryMode: PostSummaryMode,
    ): WrittenPostResult {
        val resolvedSummary = resolveCreatedSummary(title, content, summary, summaryMode)
        val contentHtmlTrust = HtmlContentSanitizer.sanitizeForPersistence(contentHtml)
        val post =
            Post(
                author = persistenceAuthor,
                title = title,
                content = content,
                published = published,
                listed = listed,
                contentHtml = contentHtmlTrust.contentHtml,
                contentHtmlHash = contentHtmlTrust.contentHtmlHash,
                contentHtmlSanitizerPolicyVersion = contentHtmlTrust.contentHtmlSanitizerPolicyVersion,
                contentHtmlTrustState = contentHtmlTrust.contentHtmlTrustState,
                thumbnail = PostPreviewExtractor.extractThumbnail(content),
            ).also { it.applyResolvedSummary(resolvedSummary) }
        val savedPost = postRepository.saveAndFlush(post)
        postHydrationService.hydrateMembersPublishedProfileWorkspaces(listOf(persistenceAuthor))
        val createdTags = postTagIndexService.syncPostTags(savedPost)
        val currentAttachmentKeys = UploadedFileUrlCodec.extractPartitionedObjectKeysFromContent(savedPost.content)
        postRepository.syncImageReferences(
            savedPost.id,
            currentAttachmentKeys.allKeys(),
        )
        postCounterService.incrementMemberPostsCount(persistenceAuthor)
        return WrittenPostResult(savedPost, createdTags, currentAttachmentKeys)
    }

    private fun resolveCreatedSummary(
        title: String,
        content: String,
        submittedSummary: String?,
        requestedMode: PostSummaryMode,
    ): PostSummaryResolver.ResolvedPostSummary =
        when (requestedMode) {
            PostSummaryMode.AUTO -> {
                PostSummaryResolver.resolveAutomatic(title, content)
            }
            PostSummaryMode.MANUAL -> PostSummaryResolver.resolveManual(content, checkNotNull(submittedSummary))
        }

    private fun resolveModifiedSummary(
        title: String,
        content: String,
        previousTitle: String,
        previousContent: String,
        previousSummaryText: String?,
        previousSummarySource: PostSummarySource,
        submittedSummary: String?,
        requestedMode: PostSummaryMode?,
    ): PostSummaryResolver.ResolvedPostSummary? =
        when (requestedMode) {
            PostSummaryMode.AUTO -> {
                requireAutomaticSummary(submittedSummary)
                PostSummaryResolver.resolveAutomatic(title, content)
            }
            PostSummaryMode.MANUAL -> PostSummaryResolver.resolveManual(content, requireNonBlankManualSummary(submittedSummary))
            null -> {
                if (submittedSummary != null) throw AppException(ErrorCode.BAD_REQUEST, "summaryMode를 명시해야 합니다.")
                if (
                    content != previousContent &&
                    previousSummarySource != PostSummarySource.MANUAL &&
                    (
                        previousSummaryText == null ||
                            previousSummaryText == PostSummaryResolver.resolveAutomatic(previousTitle, previousContent).text
                    )
                ) {
                    PostSummaryResolver.resolveAutomatic(title, content)
                } else {
                    null
                }
            }
        }

    private fun validateCreateSummaryIntent(
        summary: String?,
        mode: PostSummaryMode,
    ) {
        when (mode) {
            PostSummaryMode.AUTO -> requireAutomaticSummary(summary)
            PostSummaryMode.MANUAL -> requireNonBlankManualSummary(summary)
        }
    }

    private fun requireAutomaticSummary(summary: String?) {
        if (summary != null) {
            throw AppException(ErrorCode.BAD_REQUEST, "AUTO 요약에는 summary를 지정할 수 없습니다.")
        }
    }

    private fun requireNonBlankManualSummary(summary: String?): String =
        summary?.takeIf { it.isNotBlank() }
            ?: throw AppException(ErrorCode.BAD_REQUEST, "MANUAL 요약은 비워둘 수 없습니다.")

    private fun Post.applyResolvedSummary(resolved: PostSummaryResolver.ResolvedPostSummary) {
        updateCanonicalSummary(
            text = resolved.text,
            source = resolved.source,
            contentHash = resolved.contentHash,
            algorithmVersion = resolved.algorithmVersion,
            generatedAt = resolved.generatedAt,
        )
    }

    private fun createIdempotencyRequestSlot(
        persistenceAuthor: Member,
        idempotencyKey: String,
    ): PostWriteRequestIdempotency =
        postWriteRequestIdempotencyRepository.saveAndFlush(
            PostWriteRequestIdempotency(
                actor = persistenceAuthor,
                requestKey = idempotencyKey,
            ),
        )

    @Transactional
    override fun delete(
        post: Post,
        actor: Member,
    ) {
        val deletedPostContent = post.content
        val wasTempDraft = postTempDraftService.isTempDraft(post)
        val beforeTags = postTagIndexService.extractNormalizedTags(deletedPostContent)

        val softDeleted = postRepository.softDeleteById(post.id)
        if (!softDeleted) {
            throw AppException(ErrorCode.NOT_FOUND, "${post.id}번 글을 찾을 수 없습니다.")
        }
        postRepository.deleteImageReferencesByPostId(post.id)
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

        enqueuePostWriteSideEffect(
            PostWriteSideEffectCommand(
                postId = post.id,
                previousContent = null,
                currentContent = null,
                deletedContent = deletedPostContent,
                beforeTags = beforeTags,
                afterTags = emptyList(),
                cacheInvalidationScope =
                    resolveLifecycleCacheInvalidationScope(
                        published = post.published,
                        listed = post.listed,
                        publicScope = PostReadCacheInvalidationScope.PublicPostDeleted,
                    ),
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
        logger.info("post_delete_completed postId={} actorId={}", post.id, actor.id)
    }

    @Transactional
    override fun incrementHit(post: Post) {
        postCounterService.incrementHit(post)
        postHitSideEffectQueue.enqueue(post.id)
        invalidatePublicDetailCountersAfterCommit(post.id, "hit")
    }

    @Transactional
    override fun incrementLike(post: Post) {
        postCounterService.incrementLike(post)
        postHitSideEffectQueue.enqueue(post.id, "like")
        invalidatePublicDetailCountersAfterCommit(post.id, "like")
    }

    @Transactional
    override fun decrementLike(post: Post) {
        postCounterService.decrementLike(post)
        postHitSideEffectQueue.enqueue(post.id, "unlike")
        invalidatePublicDetailCountersAfterCommit(post.id, "unlike")
    }

    override fun findPagedByKw(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Post> {
        val normalizedKw = kw.trim()
        val safePage = page.coerceAtLeast(1)
        val safePageSize = pageSize.coerceIn(1, 100)

        if (!postKeywordSearchPipelineService.shouldApply(normalizedKw, sort, safePage, safePageSize)) {
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

    override fun findRecommendedExplorePage(
        page: Int,
        pageSize: Int,
    ): PagedResult<Post> {
        val safePage = page.coerceAtLeast(1)
        val safePageSize = pageSize.coerceIn(1, 100)

        if (!postRecommendRankingService.isEnabledForPage(safePage, safePageSize)) {
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

    override fun findPagedByKwForAdmin(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
        status: String,
    ): PagedResult<Post> =
        findAndHydratePagedPosts(page, pageSize) {
            postRepository.findQPagedByKwForAdmin(
                PostRepositoryPort.PagedQuery(
                    kw = kw,
                    zeroBasedPage = page - 1,
                    pageSize = pageSize,
                    sortProperty = sort.property,
                    sortAscending = sort.isAsc,
                    adminStatus = status,
                ),
            )
        }

    override fun findDeletedPagedByKwForAdmin(
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
    override fun restoreDeletedByIdForAdmin(id: Long): Post {
        val snapshot =
            postRepository.findDeletedSnapshotById(id)
                ?: throw AppException(ErrorCode.NOT_FOUND, "해당 글을 찾을 수 없습니다.")

        val restored = postRepository.restoreDeletedById(id)
        if (!restored) {
            throw AppException(ErrorCode.NOT_FOUND, "이미 복구되었거나 존재하지 않는 글입니다.")
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
                ?: throw AppException(ErrorCode.NOT_FOUND, "복구된 글을 확인할 수 없습니다.")
        postHydrationService.hydrateMembersPublishedProfileWorkspaces(listOf(restoredPost.author))
        val restoredTags = postTagIndexService.syncPostTags(restoredPost)
        postRepository.syncImageReferences(
            restoredPost.id,
            UploadedFileUrlCodec.extractObjectKeysFromContent(restoredPost.content),
        )
        val isPublic = isPubliclyListed(restoredPost)
        enqueuePostWriteSideEffect(
            PostWriteSideEffectCommand(
                postId = id,
                previousContent = null,
                currentContent = null,
                deletedContent = null,
                beforeTags = emptyList(),
                afterTags = restoredTags,
                cacheInvalidationScope =
                    resolveLifecycleCacheInvalidationScope(
                        published = restoredPost.published,
                        listed = restoredPost.listed,
                        publicScope = PostReadCacheInvalidationScope.PublicPostRestored,
                    ),
                evictReason = "restore",
                recommendationAction = recommendationActionFor(isPublic),
            ),
            PostModifiedEvent(
                UUID.randomUUID(),
                PostDto(restoredPost),
                MemberDto(restoredPost.author),
                emptyList(),
                restoredTags,
                wasPublic = restoredPost.published,
            ),
        )

        return restoredPost
    }

    @Transactional
    override fun hardDeleteDeletedByIdForAdmin(id: Long) {
        val snapshot =
            postRepository.findDeletedSnapshotById(id)
                ?: throw AppException(ErrorCode.NOT_FOUND, "해당 글을 찾을 수 없습니다.")

        val hardDeleted = postRepository.hardDeleteDeletedById(id)
        if (!hardDeleted) {
            throw AppException(ErrorCode.NOT_FOUND, "이미 영구삭제되었거나 존재하지 않는 글입니다.")
        }
        postRepository.deleteImageReferencesByPostId(id)

        val beforeTags = postTagIndexService.extractNormalizedTags(snapshot.content)
        enqueuePostWriteSideEffect(
            PostWriteSideEffectCommand(
                postId = id,
                previousContent = null,
                currentContent = null,
                deletedContent = snapshot.content,
                beforeTags = beforeTags,
                afterTags = emptyList(),
                cacheInvalidationScope =
                    resolveLifecycleCacheInvalidationScope(
                        published = snapshot.published,
                        listed = snapshot.listed,
                        publicScope = PostReadCacheInvalidationScope.PublicPostHardDeleted,
                    ),
                evictReason = "hard-delete",
                recommendationAction = PostRecommendationSideEffect.EVICT,
            ),
            PostDeletedEvent(
                UUID.randomUUID(),
                toDeletedSnapshotPostDto(snapshot, beforeTags),
                toDeletedSnapshotActorDto(snapshot.authorId),
                beforeTags,
                emptyList(),
            ),
        )
    }

    override fun findPagedByAuthor(
        author: Member,
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Post> =
        findAndHydratePagedPosts(page, pageSize) {
            postRepository.findQPagedByAuthorAndKw(
                author,
                PostRepositoryPort.PagedQuery(
                    kw = kw,
                    zeroBasedPage = page - 1,
                    pageSize = pageSize,
                    sortProperty = sort.property,
                    sortAscending = sort.isAsc,
                ),
            )
        }

    override fun findPagedByKwAndTag(
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

    override fun findPublicByCursor(
        cursorSortValue: Long?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post> =
        findAndHydratePublicCursorPosts {
            postRepository.findPublicByCursor(
                PostRepositoryPort.CursorQuery(
                    cursorSortValue = cursorSortValue,
                    cursorId = cursorId,
                    limit = limit,
                    sort = sort,
                ),
            )
        }

    override fun findPublicByTagCursor(
        tag: String,
        cursorSortValue: Long?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post> =
        findAndHydratePublicCursorPosts {
            postRepository.findPublicByTagCursor(
                PostRepositoryPort.TaggedCursorQuery(
                    tag = tag,
                    cursorSortValue = cursorSortValue,
                    cursorId = cursorId,
                    limit = limit,
                    sort = sort,
                ),
            )
        }

    override fun findPublicByAuthorExceptPost(
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

    override fun getPublicTagCounts(): List<TagCountDto> = postTagIndexService.getPublicTagCounts()

    override fun findAdjacentPublicPosts(
        createdAt: Instant,
        id: Long,
    ): Pair<Post?, Post?> {
        val prevPost = postRepository.findPreviousPublicPost(createdAt, id)
        val nextPost = postRepository.findNextPublicPost(createdAt, id)
        findAndHydratePublicCursorPosts { listOfNotNull(prevPost, nextPost) }
        return prevPost to nextPost
    }

    override fun findTemp(author: Member): Post? = postTempDraftService.findTemp(author)

    @Transactional
    override fun saveTempDraft(
        actor: Member,
        postId: Long,
        request: com.back.boundedContexts.post.dto.PostTempDraftSaveRequest,
    ): Post {
        val post =
            postRepository.findById(postId).orElse(null)
                ?: throw AppException(ErrorCode.NOT_FOUND, "존재하지 않는 글입니다.")
        if (post.deletedAt != null) {
            throw AppException(ErrorCode.NOT_FOUND, "존재하지 않는 글입니다.")
        }
        post.checkActorCanModify(actor)
        if (!postTempDraftService.isTempDraft(post)) {
            throw AppException(ErrorCode.BAD_REQUEST, "임시저장 상태의 글만 임시초안 자동저장을 수행할 수 있습니다.")
        }
        postHydrationService.hydratePostAttrs(post)

        val currentVersion = post.version ?: 0L
        if (request.version != null && request.version != currentVersion) {
            throw AppException(
                ErrorCode.POST_CONCURRENT_EDIT,
                "다른 세션에서 이미 수정되었습니다. 최신 글을 다시 불러온 뒤 수정해주세요.",
            )
        }

        val previousTitle = post.title
        val previousContent = post.content
        val previousSummaryText = post.summaryText
        val previousSummarySource = post.summarySource
        val previousTags = postTagIndexService.extractNormalizedTags(previousContent)

        val thumbnail =
            request.thumbnail?.trim()?.takeIf(String::isNotBlank)
                ?: PostPreviewExtractor.extractThumbnail(request.content)

        post.modify(
            title = request.title,
            content = request.content,
            published = false,
            listed = false,
            thumbnail = thumbnail,
        )
        post.isTempDraft = true
        post.published = false
        post.listed = false
        postTempDraftService.updateTempDraftMarker(post.author, post.id)

        resolveModifiedSummary(
            title = request.title,
            content = request.content,
            previousTitle = previousTitle,
            previousContent = previousContent,
            previousSummaryText = previousSummaryText,
            previousSummarySource = previousSummarySource,
            submittedSummary = request.summary,
            requestedMode = request.summaryMode,
        )?.let { resolved -> post.applyResolvedSummary(resolved) }

        val afterTags = postTagIndexService.syncPostTags(post)
        val currentAttachmentKeys = UploadedFileUrlCodec.extractPartitionedObjectKeysFromContent(post.content)
        postRepository.syncImageReferences(
            post.id,
            currentAttachmentKeys.allKeys(),
        )
        postRepository.flush()
        enqueuePostWriteSideEffect(
            PostWriteSideEffectCommand(
                postId = post.id,
                previousContent = previousContent,
                currentContent = post.content,
                deletedContent = null,
                beforeTags = previousTags,
                afterTags = afterTags,
                cacheInvalidationScope = PostReadCacheInvalidationScope.AdminPostListAndDetail,
                evictReason = "temp-draft-save",
                recommendationAction = PostRecommendationSideEffect.NONE,
                preExtractedCurrentKeys = currentAttachmentKeys,
            ),
        )
        return post
    }

    @Transactional
    override fun getOrCreateTemp(author: Member): Pair<Post, Boolean> =
        postTempDraftService.getOrCreateTemp(author).also { (post, created) ->
            if (created) {
                val invalidator = postReadCacheInvalidator ?: return@also
                val request =
                    PostReadCacheInvalidationRequest(
                        postId = post.id,
                        beforeTags = emptyList(),
                        afterTags = emptyList(),
                        scope = PostReadCacheInvalidationScope.AdminPostListOnly,
                        evictReason = "temp-draft-create",
                    )
                scheduleCacheInvalidationAfterCommit(post.id) {
                    invalidator.invalidate(request)
                }
            }
        }

    override fun isTempDraft(post: Post): Boolean = postTempDraftService.isTempDraft(post)

    override fun resolveTempDraftPostIds(posts: List<Post>): Set<Long> = postTempDraftService.resolveTempDraftPostIds(posts)

    /**
     * 참조 구현: apache/answer (Apache-2.0), TryGhost/Ghost (MIT)
     * 관리자 글 일괄 처리(벌크 액션). 중복 ID를 순서대로 distinct 처리하고 커밋 후 캐시 무효화 수행.
     */
    @Transactional
    override fun bulkActionForAdmin(
        actor: Member,
        ids: List<Long>,
        action: com.back.boundedContexts.post.dto.AdmPostBulkActionType,
    ): com.back.boundedContexts.post.dto.AdmPostBulkActionResBody {
        val distinctIds = ids.distinct()
        val processedIds = mutableListOf<Long>()
        val activePostsById =
            when (action) {
                com.back.boundedContexts.post.dto.AdmPostBulkActionType.DELETE,
                com.back.boundedContexts.post.dto.AdmPostBulkActionType.PUBLISH_LISTED,
                com.back.boundedContexts.post.dto.AdmPostBulkActionType.PUBLISH_UNLISTED,
                com.back.boundedContexts.post.dto.AdmPostBulkActionType.UNPUBLISH_PRIVATE,
                -> postRepository.findAllByIds(distinctIds).associateBy { it.id }
                com.back.boundedContexts.post.dto.AdmPostBulkActionType.RESTORE,
                com.back.boundedContexts.post.dto.AdmPostBulkActionType.HARD_DELETE,
                -> emptyMap()
            }

        for (id in distinctIds) {
            when (action) {
                com.back.boundedContexts.post.dto.AdmPostBulkActionType.DELETE -> {
                    val post = activePostsById[id]
                    if (post != null && post.deletedAt == null) {
                        delete(post, actor)
                        processedIds.add(id)
                    }
                }
                com.back.boundedContexts.post.dto.AdmPostBulkActionType.RESTORE -> {
                    if (postRepository.findDeletedSnapshotById(id) != null) {
                        restoreDeletedByIdForAdmin(id)
                        processedIds.add(id)
                    }
                }
                com.back.boundedContexts.post.dto.AdmPostBulkActionType.HARD_DELETE -> {
                    if (postRepository.findDeletedSnapshotById(id) != null) {
                        hardDeleteDeletedByIdForAdmin(id)
                        processedIds.add(id)
                    }
                }
                com.back.boundedContexts.post.dto.AdmPostBulkActionType.PUBLISH_LISTED -> {
                    val post = activePostsById[id]
                    if (post != null && post.deletedAt == null) {
                        modify(
                            actor = actor,
                            post = post,
                            title = post.title,
                            content = post.content,
                            published = true,
                            listed = true,
                            expectedVersion = post.version ?: 0L,
                            contentHtml = null,
                            summary = null,
                            summaryMode = null,
                        )
                        processedIds.add(id)
                    }
                }
                com.back.boundedContexts.post.dto.AdmPostBulkActionType.PUBLISH_UNLISTED -> {
                    val post = activePostsById[id]
                    if (post != null && post.deletedAt == null) {
                        modify(
                            actor = actor,
                            post = post,
                            title = post.title,
                            content = post.content,
                            published = true,
                            listed = false,
                            expectedVersion = post.version ?: 0L,
                            contentHtml = null,
                            summary = null,
                            summaryMode = null,
                        )
                        processedIds.add(id)
                    }
                }
                com.back.boundedContexts.post.dto.AdmPostBulkActionType.UNPUBLISH_PRIVATE -> {
                    val post = activePostsById[id]
                    if (post != null && post.deletedAt == null) {
                        modify(
                            actor = actor,
                            post = post,
                            title = post.title,
                            content = post.content,
                            published = false,
                            listed = false,
                            expectedVersion = post.version ?: 0L,
                            contentHtml = null,
                            summary = null,
                            summaryMode = null,
                        )
                        processedIds.add(id)
                    }
                }
            }
        }

        return com.back.boundedContexts.post.dto.AdmPostBulkActionResBody(
            processedCount = processedIds.size,
            ids = processedIds,
        )
    }

    private fun resolveLifecycleCacheInvalidationScope(
        published: Boolean,
        listed: Boolean,
        publicScope: PostReadCacheInvalidationScope,
    ): PostReadCacheInvalidationScope =
        when {
            published && listed -> publicScope
            published -> PostReadCacheInvalidationScope.AdminPostListAndDetail
            else -> PostReadCacheInvalidationScope.AdminPostListOnly
        }

    private fun findAndHydratePagedPosts(
        page: Int,
        pageSize: Int,
        loader: () -> PostRepositoryPort.PagedResult<Post>,
    ): PagedResult<Post> {
        val pageResult = loader()
        postHydrationService.hydratePostAttrs(pageResult.content)
        postHydrationService.hydrateMembersPublishedProfileWorkspaces(pageResult.content.map { it.author })
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
        postHydrationService.hydrateMembersPublishedProfileWorkspaces(posts.map { it.author })
        return posts
    }

    private fun recommendationActionFor(isPublic: Boolean): PostRecommendationSideEffect =
        if (isPublic) PostRecommendationSideEffect.REFRESH else PostRecommendationSideEffect.EVICT

    private fun enqueuePostWriteSideEffect(
        command: PostWriteSideEffectCommand,
        domainEvent: EventPayload? = null,
    ) {
        taskFacade.addToQueue(command.toTaskPayload(domainEvent))
        invalidateReadCacheAfterCommit(command)
    }

    private fun invalidateReadCacheAfterCommit(command: PostWriteSideEffectCommand) {
        val invalidator = postReadCacheInvalidator ?: return
        if (command.cacheInvalidationScope.isEmpty()) return
        val request =
            PostReadCacheInvalidationRequest(
                postId = command.postId,
                beforeTags = command.beforeTags,
                afterTags = command.afterTags,
                scope = command.cacheInvalidationScope,
                evictReason = command.evictReason,
            )
        scheduleCacheInvalidationAfterCommit(command.postId) {
            invalidator.invalidate(request)
        }
    }

    private fun invalidatePublicDetailCountersAfterCommit(
        postId: Long,
        reason: String,
    ) {
        val invalidator = postReadCacheInvalidator ?: return
        scheduleCacheInvalidationAfterCommit(postId) {
            invalidator.invalidatePublicDetailCounters(postId, reason)
        }
    }

    private fun scheduleCacheInvalidationAfterCommit(
        postId: Long,
        action: () -> Unit,
    ) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                object : TransactionSynchronization {
                    override fun afterCommit() {
                        runImmediateCacheInvalidation(postId, action)
                    }
                },
            )
        } else {
            runImmediateCacheInvalidation(postId, action)
        }
    }

    private fun runImmediateCacheInvalidation(
        postId: Long,
        action: () -> Unit,
    ) {
        runCatching(action).onFailure { exception ->
            logger.warn(
                "Immediate post read cache invalidation failed for postId={}; async task will retry",
                postId,
                exception,
            )
        }
    }

    private fun PostWriteSideEffectCommand.toTaskPayload(domainEvent: EventPayload?): PostWriteSideEffectPayload =
        PostWriteSideEffectPayload(
            uid = postWriteSideEffectTaskUid(this, domainEvent),
            aggregateType = domainEvent?.aggregateType ?: "Post",
            aggregateId = postId,
            postId = postId,
            attachmentKeys =
                PostAttachmentObjectKeySnapshot.fromContents(
                    previousContent = previousContent,
                    currentContent = currentContent,
                    deletedContent = deletedContent,
                    preExtractedCurrentKeys = preExtractedCurrentKeys,
                ),
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
        summaryChanged: Boolean,
    ): Set<PostPublicChangeImpact> =
        buildSet {
            if (listingVisibilityChanged) add(PostPublicChangeImpact.LISTING_VISIBILITY)
            if (titleChanged) add(PostPublicChangeImpact.TITLE)
            if (contentChanged) add(PostPublicChangeImpact.CONTENT)
            if (tagChanged) add(PostPublicChangeImpact.TAG)
            if (summaryChanged) add(PostPublicChangeImpact.SUMMARY)
        }

    private fun isPubliclyListed(post: Post): Boolean = post.published && post.listed

    private fun toDeletedSnapshotPostDto(
        snapshot: AdmDeletedPostSnapshotDto,
        beforeTags: List<String>,
    ): PostDto {
        val now = Instant.now()
        return PostDto(
            id = snapshot.id,
            createdAt = now,
            modifiedAt = now,
            authorId = snapshot.authorId,
            authorName = "",
            authorUsername = "",
            authorProfileImgUrl = "",
            title = snapshot.title,
            thumbnail = null,
            summary = "",
            version = 0L,
            published = snapshot.published,
            listed = snapshot.listed,
            tempDraft = false,
            likesCount = 0,
            hitCount = 0,
            tags = beforeTags,
            category = emptyList(),
        )
    }

    private fun toDeletedSnapshotActorDto(authorId: Long): MemberDto {
        val now = Instant.now()
        return MemberDto(
            id = authorId,
            createdAt = now,
            modifiedAt = now,
            isAdmin = true,
            name = "admin",
        )
    }
}
