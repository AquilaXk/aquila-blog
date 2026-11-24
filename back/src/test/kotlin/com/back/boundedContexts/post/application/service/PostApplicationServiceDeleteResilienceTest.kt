package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostWriteRequestIdempotencyRepositoryPort
import com.back.boundedContexts.post.application.port.output.SecureTipPort
import com.back.boundedContexts.post.domain.POSTS_COUNT
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.boundedContexts.post.dto.AdmDeletedPostSnapshotDto
import com.back.boundedContexts.post.dto.AdmPostBulkActionType
import com.back.boundedContexts.post.dto.PostInteractionReadStateDto
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.global.app.AppConfig
import com.back.global.event.application.EventPublisher
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.global.task.application.TaskFacade
import com.back.global.task.application.TaskHandlerEntry
import com.back.global.task.application.TaskHandlerMethod
import com.back.global.task.application.TaskHandlerRegistry
import com.back.global.task.application.TaskPayloadEnvelope
import com.back.global.task.application.TaskPayloadEnvelopeCodec
import com.back.global.task.application.TaskRetryPolicy
import com.back.global.task.application.port.output.TaskQueueInsertPort
import com.back.global.task.application.port.output.TaskQueueInsertResult
import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.application.port.output.TaskTypeCountAggregate
import com.back.global.task.application.port.output.TaskTypeQueueSnapshotAggregate
import com.back.global.task.application.port.output.TaskTypeReadyAggregate
import com.back.global.task.application.port.output.TaskTypeStatusAggregate
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import com.back.standard.util.Ut
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import org.mockito.ArgumentMatchers
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.BDDMockito.willReturn
import org.mockito.Mockito.inOrder
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.times
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.cache.CacheManager
import org.springframework.data.domain.Pageable
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionException
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Optional

@DisplayName("PostApplicationServiceDeleteResilience 테스트")
class PostApplicationServiceDeleteResilienceTest {
    init {
        AppConfig(
            siteBackUrl = "http://localhost:8080",
            siteFrontUrl = "http://localhost:3000",
        )
    }

    private val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
    private val postAttrRepository: PostAttrRepositoryPort = mock(PostAttrRepositoryPort::class.java)
    private val memberAttrRepository: MemberAttrRepositoryPort = mock(MemberAttrRepositoryPort::class.java)
    private val postLikeRepository: PostLikeRepositoryPort = mock(PostLikeRepositoryPort::class.java)
    private val postTagIndexRepository: PostTagIndexRepositoryPort = mock(PostTagIndexRepositoryPort::class.java)
    private val postWriteRequestIdempotencyRepository: PostWriteRequestIdempotencyRepositoryPort =
        mock(PostWriteRequestIdempotencyRepositoryPort::class.java)
    private val memberRepository: MemberRepositoryPort = mock(MemberRepositoryPort::class.java)
    private val secureTipPort: SecureTipPort = mock(SecureTipPort::class.java)
    private val eventPublisher: EventPublisher = mock(EventPublisher::class.java)
    private val uploadedFileRetentionService: UploadedFileRetentionService = mock(UploadedFileRetentionService::class.java)
    private val cacheManager: CacheManager = mock(CacheManager::class.java)
    private val transactionManager: PlatformTransactionManager = NoopTransactionManager()
    private val postRecommendRankingService: PostRecommendRankingService = mock(PostRecommendRankingService::class.java)
    private val postRecommendFeatureStoreService: PostRecommendFeatureStoreService =
        mock(PostRecommendFeatureStoreService::class.java)
    private val postKeywordSearchPipelineService: PostKeywordSearchPipelineService =
        mock(PostKeywordSearchPipelineService::class.java)
    private val objectMapper = jacksonObjectMapper().also { Ut.JSON.objectMapper = it }
    private val postReadCacheInvalidator = PostReadCacheInvalidator(cacheManager)
    private val postHydrationService = PostHydrationService(postAttrRepository, memberAttrRepository)
    private val postWriteSideEffectHandler =
        PostWriteSideEffectHandler(
            postReadCacheInvalidator = postReadCacheInvalidator,
            uploadedFileRetentionService = uploadedFileRetentionService,
            postRecommendFeatureStoreService = postRecommendFeatureStoreService,
            postRepository = postRepository,
            postHydrationService = postHydrationService,
            eventPublisher = eventPublisher,
            objectMapper = objectMapper,
            transactionManager = transactionManager,
        )
    private val taskRepository = RecordingTaskQueueRepository()
    private val taskFacade: TaskFacade =
        TaskFacade(
            taskInsertPort = taskRepository,
            taskHandlerRegistry = postWriteTaskHandlerRegistry(),
            taskPayloadEnvelopeCodec = TaskPayloadEnvelopeCodec(objectMapper, Clock.systemUTC()),
        )
    private val postCounterService =
        PostCounterService(
            postRepository = postRepository,
            postAttrRepository = postAttrRepository,
            memberAttrRepository = memberAttrRepository,
            postLikeRepository = postLikeRepository,
        )
    private val postTagIndexService =
        PostTagIndexService(
            postTagIndexRepository = postTagIndexRepository,
        )
    private val postTempDraftService = PostTempDraftService(postRepository, memberAttrRepository, postHydrationService)
    private val postHitSideEffectQueue = PostHitSideEffectQueue(taskFacade)
    private val service =
        PostApplicationService(
            postRepository = postRepository,
            postWriteRequestIdempotencyRepository = postWriteRequestIdempotencyRepository,
            memberRepository = memberRepository,
            secureTipPort = secureTipPort,
            uploadedFileRetentionService = uploadedFileRetentionService,
            postRecommendRankingService = postRecommendRankingService,
            postKeywordSearchPipelineService = postKeywordSearchPipelineService,
            taskFacade = taskFacade,
            objectMapper = objectMapper,
            postHydrationService = postHydrationService,
            postCounterService = postCounterService,
            postTagIndexService = postTagIndexService,
            postTempDraftService = postTempDraftService,
            postHitSideEffectQueue = postHitSideEffectQueue,
        )

    @Test
    @DisplayName("likePost와 unlikePost는 PostLike 영속 여부에 따라 경량 카운터를 멱등하게 증감하고 부수효과를 적재한다")
    fun likeAndUnlikePostPersistPostLikeIdempotently() {
        given(postLikeRepository.insertIfAbsentByIds(7L, 201L)).willReturn(501L, null)
        given(postAttrRepository.incrementIntValueBySubjectId(201L, LIKES_COUNT, 1)).willReturn(1)
        given(postRepository.findInteractionReadStateById(201L)).willReturn(
            PostInteractionReadStateDto(id = 201L, authorId = 1L, published = true, hitCount = 3, likesCount = 1),
        )
        given(postLikeRepository.deleteByLikerIdAndPostId(7L, 201L)).willReturn(1, 0)
        given(postLikeRepository.countByPostId(201L)).willReturn(0L)
        given(postAttrRepository.incrementIntValueBySubjectId(201L, LIKES_COUNT, -1)).willReturn(0)

        assertThat(service.likePost(201L, 7L)).isEqualTo(1)
        assertThat(service.likePost(201L, 7L)).isEqualTo(1)
        then(postAttrRepository).should(times(1)).incrementIntValueBySubjectId(201L, LIKES_COUNT, 1)
        then(postRepository).should(times(1)).updateLikesCountById(201L, 1)

        given(postRepository.findInteractionReadStateById(201L)).willReturn(
            PostInteractionReadStateDto(id = 201L, authorId = 1L, published = true, hitCount = 3, likesCount = 0),
        )
        assertThat(service.unlikePost(201L, 7L)).isEqualTo(0)
        assertThat(service.unlikePost(201L, 7L)).isEqualTo(0)
        then(postAttrRepository).should(times(1)).incrementIntValueBySubjectId(201L, LIKES_COUNT, -1)
        then(postRepository).should(times(1)).updateLikesCountById(201L, 0)
        then(postRepository).should(never()).findById(201L)
    }

    @Test
    @DisplayName("findPublicDetailById는 작성자 프로필과 함께 카운터 PostAttr를 배치 조회해 hydrate한다")
    fun hydratePostAttrsOnFindPublicDetailById() {
        val author = member(10, "상세 작성자")
        val post = Post(id = 200, author = author, title = "공개 상세", content = "본문", published = true, listed = true)
        given(postRepository.findPublicDetailById(200)).willReturn(post)
        given(
            postAttrRepository.findBySubjectInAndNameIn(
                listOf(post),
                listOf(LIKES_COUNT, HIT_COUNT),
            ),
        ).willReturn(
            listOf(
                PostAttr(1L, post, LIKES_COUNT, 6),
                PostAttr(2L, post, HIT_COUNT, 19),
            ),
        )

        val result = service.findPublicDetailById(200)

        assertThat(result).isSameAs(post)
        assertThat(post.likesCount).isEqualTo(6)
        assertThat(post.hitCount).isEqualTo(19)
        then(postAttrRepository).should().findBySubjectInAndNameIn(
            listOf(post),
            listOf(LIKES_COUNT, HIT_COUNT),
        )
    }

    @Test
    @DisplayName("멱등 글 작성은 replay slot 조회 전에 작성자 행을 잠근다")
    fun lockActorBeforeLookingUpIdempotencyReplaySlot() {
        // given
        val author = member(1, "요청 작성자")
        val lockedAuthor = member(1, "잠긴 작성자")
        val replayedPost = Post(id = 101, author = lockedAuthor, title = "기존 글", content = "본문")
        val requestSlot =
            com.back.boundedContexts.post.domain.PostWriteRequestIdempotency(
                actor = lockedAuthor,
                requestKey = "write-001",
                postId = replayedPost.id,
            )
        given(memberRepository.findByIdForUpdate(author.id)).willReturn(Optional.of(lockedAuthor))
        given(postWriteRequestIdempotencyRepository.findByActorAndRequestKey(lockedAuthor, "write-001"))
            .willReturn(requestSlot)
        given(postRepository.findById(replayedPost.id)).willReturn(Optional.of(replayedPost))

        // when
        val result =
            service.write(
                author = author,
                title = "재시도 글",
                content = "재시도 본문",
                idempotencyKey = "write-001",
                summaryMode = PostSummaryMode.AUTO,
            )

        // then
        assertThat(result).isSameAs(replayedPost)
        inOrder(memberRepository, postWriteRequestIdempotencyRepository).apply {
            verify(memberRepository).findByIdForUpdate(author.id)
            verify(postWriteRequestIdempotencyRepository).findByActorAndRequestKey(lockedAuthor, "write-001")
        }
    }

    @Test
    @DisplayName("멱등 글 작성은 없는 작성자를 slot 조회 전에 NOT_FOUND로 중단한다")
    fun stopBeforeSlotLookupWhenIdempotencyActorIsMissing() {
        // given
        val author = member(2, "사라진 작성자")
        given(memberRepository.findByIdForUpdate(author.id)).willReturn(Optional.empty())

        // when & then
        assertThatThrownBy {
            service.write(
                author = author,
                title = "실패 글",
                content = "실패 본문",
                idempotencyKey = "write-002",
                summaryMode = PostSummaryMode.AUTO,
            )
        }.isInstanceOf(AppException::class.java)
            .extracting("errorCode")
            .isEqualTo(ErrorCode.NOT_FOUND)

        verifyNoInteractions(postWriteRequestIdempotencyRepository)
    }

    @Test
    @DisplayName("키 없는 글 작성은 작성자 잠금을 획득하지 않는다")
    fun doNotLockActorForUnkeyedWrite() {
        // given
        val author = member(3, "일반 작성자")
        val savedPost =
            Post(id = 102, author = author, title = "일반 글", content = "일반 본문").apply {
                createdAt = Instant.now()
                modifiedAt = createdAt
            }
        given(postRepository.saveAndFlush(anyPost())).willReturn(savedPost)

        // when
        service.write(
            author = author,
            title = "일반 글",
            content = "일반 본문",
            summaryMode = PostSummaryMode.AUTO,
        )

        // then
        verifyNoInteractions(memberRepository)
    }

    private fun member(
        id: Long,
        nickname: String,
    ): Member =
        Member(
            id = id,
            username = "member-$id",
            password = null,
            nickname = nickname,
            email = "member-$id@test.com",
            apiKey = "member-$id-api-key",
        ).also {
            it.createdAt = Instant.now()
            it.modifiedAt = it.createdAt
            it.setProfileWorkspacePublishedContent(MemberProfileWorkspaceContent())
        }

    private fun anyPost(): Post =
        ArgumentMatchers.any(Post::class.java)
            ?: Post(
                author = Member(id = 0, username = "dummy", nickname = "dummy", apiKey = "dummy"),
                title = "dummy",
                content = "dummy",
            )

    @Test
    @DisplayName("delete는 member posts 카운터 보정 실패가 나도 soft delete를 완료한다")
    fun completeSoftDeleteWhenMemberPostsCounterRepairFails() {
        // given
        val author =
            Member(
                id = 1,
                username = "author",
                password = null,
                nickname = "작성자",
                email = null,
                apiKey = "author-api-key",
            ).also { it.setProfileWorkspacePublishedContent(MemberProfileWorkspaceContent()) }
        val actor =
            Member(
                id = 2,
                username = "admin",
                password = null,
                nickname = "관리자",
                email = null,
                apiKey = "admin-api-key",
            )
        val post =
            Post(
                id = 10,
                author = author,
                title = "삭제 대상",
                content = "본문",
                published = true,
                listed = true,
            )
        val now = Instant.now()
        author.createdAt = now
        author.modifiedAt = now
        actor.createdAt = now
        actor.modifiedAt = now
        post.createdAt = now
        post.modifiedAt = now

        given(memberAttrRepository.incrementIntValue(author, POSTS_COUNT, -1))
            .willThrow(RuntimeException("counter update failure"))
        given(postRepository.softDeleteById(post.id)).willReturn(true)

        // when & then
        assertThatThrownBy {
            service.delete(post, actor)
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessage("counter update failure")

        then(postRepository).should().softDeleteById(post.id)
        then(memberAttrRepository).should().incrementIntValue(author, POSTS_COUNT, -1)
        then(postRepository).should(never()).countByAuthor(author)
        assertThat(taskRepository.savedTasks).isEmpty()
    }

    @Test
    @DisplayName("관리자 복구 중 회원 글 수 갱신이나 첨부 복구 실패는 예외를 전파해 트랜잭션을 롤백한다")
    fun rethrowCounterOrAttachmentFailureDuringRestoreSoTransactionRollsBack() {
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 21,
                title = "복구 대상",
                content = "tags: tag\n\n복구 본문",
                authorId = 3,
                published = true,
                listed = true,
            )
        given(postRepository.findDeletedSnapshotById(21)).willReturn(snapshot)
        given(postRepository.restoreDeletedById(21)).willReturn(true)
        given(memberAttrRepository.incrementIntValue(Member(3), POSTS_COUNT, 1))
            .willThrow(RuntimeException("restore counter failure"))

        assertThatThrownBy {
            service.restoreDeletedByIdForAdmin(21)
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessage("restore counter failure")
        verifyNoInteractions(uploadedFileRetentionService)
        assertThat(taskRepository.savedTasks).isEmpty()

        willReturn(1).given(memberAttrRepository).incrementIntValue(Member(3), POSTS_COUNT, 1)
        given(uploadedFileRetentionService.restoreDeletedPostAttachments(21, snapshot.content))
            .willThrow(RuntimeException("attachment restore failure"))

        assertThatThrownBy {
            service.restoreDeletedByIdForAdmin(21)
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessage("attachment restore failure")
        assertThat(taskRepository.savedTasks).isEmpty()
    }

    @Test
    @DisplayName("관리자 복구는 캐시와 추천 후속 작업을 commit 이후에 실행한다")
    fun runRestoreSideEffectsAfterCommit() {
        // given
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 21,
                title = "복구 대상",
                content = "tags: tag\n\n복구 본문",
                authorId = 3,
                published = true,
                listed = true,
            )
        val restoredPost =
            Post(
                id = 21,
                author =
                    Member(
                        id = 3,
                        username = "restored-author",
                        password = null,
                        nickname = "복구작성자",
                        email = null,
                        apiKey = "restored-author-api-key",
                    ).also {
                        it.createdAt = Instant.now()
                        it.modifiedAt = it.createdAt
                        it.setProfileWorkspacePublishedContent(MemberProfileWorkspaceContent())
                    },
                title = "복구 대상",
                content = "tags: tag\n\n복구 본문",
                published = true,
                listed = true,
            ).apply {
                createdAt = Instant.now()
                modifiedAt = createdAt
            }
        given(postRepository.findDeletedSnapshotById(21)).willReturn(snapshot)
        given(postRepository.restoreDeletedById(21)).willReturn(true)
        given(postRepository.findById(21)).willReturn(Optional.of(restoredPost))

        // when
        service.restoreDeletedByIdForAdmin(21)
        val payload = capturePostWriteSideEffectPayload()

        // then
        verifyNoInteractions(cacheManager, postRecommendFeatureStoreService)

        // when
        postWriteSideEffectHandler.handle(payload)

        // then
        then(cacheManager).should().getCache(PostQueryCacheNames.FEED)
        then(postRecommendFeatureStoreService).should().refresh(restoredPost)
        then(postTagIndexRepository).should().replacePostTags(21, listOf("tag"))
    }

    @Test
    @DisplayName("관리자 복구 후속 작업 UID는 같은 글 반복 복구에서도 충돌하지 않는다")
    fun createUniqueRestoreSideEffectTaskUidForRepeatedRestore() {
        // given
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 25,
                title = "반복 복구 대상",
                content = "반복 복구 본문 #tag",
                authorId = 3,
                published = true,
                listed = true,
            )
        val restoredPost =
            Post(
                id = 25,
                author =
                    Member(
                        id = 3,
                        username = "repeat-restore-author",
                        password = null,
                        nickname = "반복복구작성자",
                        email = null,
                        apiKey = "repeat-restore-author-api-key",
                    ).also {
                        it.createdAt = Instant.now()
                        it.modifiedAt = it.createdAt
                        it.setProfileWorkspacePublishedContent(MemberProfileWorkspaceContent())
                    },
                title = "반복 복구 대상",
                content = "반복 복구 본문 #tag",
                published = true,
                listed = true,
            ).apply {
                createdAt = Instant.now()
                modifiedAt = createdAt
            }
        given(postRepository.findDeletedSnapshotById(25)).willReturn(snapshot)
        given(postRepository.restoreDeletedById(25)).willReturn(true)
        given(postRepository.findById(25)).willReturn(Optional.of(restoredPost))

        // when
        service.restoreDeletedByIdForAdmin(25)
        service.restoreDeletedByIdForAdmin(25)

        // then
        val payloads = capturePostWriteSideEffectPayloads()
        assertThat(payloads).hasSize(2)
        assertThat(payloads.map { it.uid }).doesNotHaveDuplicates()
    }

    @Test
    @DisplayName("관리자 영구삭제는 캐시와 첨부파일 정리와 추천 evict를 commit 이후에 실행한다")
    fun runHardDeleteSideEffectsAfterCommit() {
        // given
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 22,
                title = "영구삭제 대상",
                content = "영구삭제 본문 #tag",
                authorId = 4,
                published = true,
                listed = true,
            )
        given(postRepository.findDeletedSnapshotById(22)).willReturn(snapshot)
        given(postRepository.hardDeleteDeletedById(22)).willReturn(true)

        // when
        service.hardDeleteDeletedByIdForAdmin(22)
        val payload = capturePostWriteSideEffectPayload()

        // then
        verifyNoInteractions(cacheManager, uploadedFileRetentionService, postRecommendFeatureStoreService)

        // when
        postWriteSideEffectHandler.handle(payload)

        // then
        then(cacheManager).should().getCache(PostQueryCacheNames.FEED)
        then(uploadedFileRetentionService).should().scheduleDeletedPostAttachmentKeys(emptyList(), emptyList())
        then(postRecommendFeatureStoreService).should().evict(22)
    }

    @Test
    @DisplayName("관리자 비공개 글 영구삭제는 관리자 목록 캐시만 비우고 공개 피드 캐시는 무효화하지 않는다")
    fun skipPublicReadCacheInvalidationForPrivateHardDelete() {
        // given
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 23,
                title = "비공개 영구삭제 대상",
                content = "비공개 영구삭제 본문 #tag",
                authorId = 4,
                published = false,
                listed = false,
            )
        given(postRepository.findDeletedSnapshotById(23)).willReturn(snapshot)
        given(postRepository.hardDeleteDeletedById(23)).willReturn(true)

        // when
        service.hardDeleteDeletedByIdForAdmin(23)
        val payload = capturePostWriteSideEffectPayload()

        postWriteSideEffectHandler.handle(payload)

        // then
        then(cacheManager).should().getCache(PostQueryCacheNames.ADMIN_POSTS_FIRST_PAGE)
        then(cacheManager).shouldHaveNoMoreInteractions()
        then(uploadedFileRetentionService).should().scheduleDeletedPostAttachmentKeys(emptyList(), emptyList())
        then(postRecommendFeatureStoreService).should().evict(23)
    }

    @ParameterizedTest
    @CsvSource(
        "true,false",
        "false,true",
    )
    @DisplayName("관리자 부분공개 상태 영구삭제는 공개 목록 캐시를 무효화하지 않고 관리자 목록/상세 캐시만 비운다")
    fun skipPublicReadCacheInvalidationForPartiallyPublicHardDelete(
        published: Boolean,
        listed: Boolean,
    ) {
        // given
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 24,
                title = "부분공개 영구삭제 대상",
                content = "부분공개 영구삭제 본문 #tag",
                authorId = 4,
                published = published,
                listed = listed,
            )
        given(postRepository.findDeletedSnapshotById(24)).willReturn(snapshot)
        given(postRepository.hardDeleteDeletedById(24)).willReturn(true)

        // when
        service.hardDeleteDeletedByIdForAdmin(24)
        val payload = capturePostWriteSideEffectPayload()

        postWriteSideEffectHandler.handle(payload)

        // then
        if (published && !listed) {
            then(cacheManager).should().getCache(PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT)
            then(cacheManager).should().getCache(PostQueryCacheNames.DETAIL_PUBLIC_META)
            then(cacheManager).should().getCache(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT)
            then(cacheManager).should().getCache(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE)
            then(cacheManager).should().getCache(PostQueryCacheNames.ADJACENT_POSTS)
            then(cacheManager).should().getCache(PostQueryCacheNames.BACKLINKS)
        }
        then(cacheManager).should().getCache(PostQueryCacheNames.ADMIN_POSTS_FIRST_PAGE)
        then(cacheManager).shouldHaveNoMoreInteractions()
        then(uploadedFileRetentionService).should().scheduleDeletedPostAttachmentKeys(emptyList(), emptyList())
        then(postRecommendFeatureStoreService).should().evict(24)
    }

    @Test
    @DisplayName("트랜잭션 동기화가 비활성인 환경에서도 postReadCacheInvalidator가 주입되어 있으면 즉시 캐시를 비우고 예외는 격리한다")
    fun immediateCacheInvalidationWithoutTransactionSynchronizationIsolatesFailure() {
        val serviceWithInvalidator =
            PostApplicationService(
                postRepository = postRepository,
                postWriteRequestIdempotencyRepository = postWriteRequestIdempotencyRepository,
                memberRepository = memberRepository,
                secureTipPort = secureTipPort,
                uploadedFileRetentionService = uploadedFileRetentionService,
                postRecommendRankingService = postRecommendRankingService,
                postKeywordSearchPipelineService = postKeywordSearchPipelineService,
                taskFacade = taskFacade,
                objectMapper = objectMapper,
                postHydrationService = postHydrationService,
                postCounterService = postCounterService,
                postTagIndexService = postTagIndexService,
                postTempDraftService = postTempDraftService,
                postHitSideEffectQueue = postHitSideEffectQueue,
                postReadCacheInvalidator = postReadCacheInvalidator,
            )
        val author = member(9, "즉시무효화작성자")
        val savedPost =
            Post(id = 301, author = author, title = "즉시 무효화", content = "본문", published = true, listed = true).apply {
                createdAt = Instant.now()
                modifiedAt = createdAt
            }
        given(postRepository.saveAndFlush(anyPost())).willReturn(savedPost)
        given(cacheManager.getCache(PostQueryCacheNames.FEED)).willThrow(RuntimeException("redis down"))

        assertDoesNotThrow {
            serviceWithInvalidator.write(
                author = author,
                title = "즉시 무효화",
                content = "본문",
                published = true,
                listed = true,
                summaryMode = PostSummaryMode.AUTO,
            )
        }

        then(cacheManager).should().getCache(PostQueryCacheNames.FEED)
        assertThat(postWriteSideEffectTasks()).hasSize(1)
    }

    @Test
    @DisplayName("bulkActionForAdmin RESTORE는 ID당 findDeletedSnapshotById를 1회만 호출한다")
    fun bulkRestoreQueriesDeletedSnapshotOncePerId() {
        val actor = member(1, "관리자")
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 31L,
                title = "벌크 복구 대상",
                content = "본문 #tag",
                authorId = 3L,
                published = true,
                listed = true,
            )
        val restoredPost =
            Post(
                id = 31L,
                author = member(3L, "작성자"),
                title = "벌크 복구 대상",
                content = "본문 #tag",
                published = true,
                listed = true,
            ).apply {
                createdAt = Instant.now()
                modifiedAt = createdAt
            }
        given(postRepository.findDeletedSnapshotById(31L)).willReturn(snapshot)
        given(postRepository.findDeletedSnapshotById(99L)).willReturn(null)
        given(postRepository.restoreDeletedById(31L)).willReturn(true)
        given(postRepository.findById(31L)).willReturn(Optional.of(restoredPost))

        val result = service.bulkActionForAdmin(actor, listOf(31L, 31L, 99L), AdmPostBulkActionType.RESTORE)

        assertThat(result.processedCount).isEqualTo(1)
        assertThat(result.ids).containsExactly(31L)
        then(postRepository).should(times(1)).findDeletedSnapshotById(31L)
        then(postRepository).should(times(1)).findDeletedSnapshotById(99L)
        then(postRepository).should(times(1)).restoreDeletedById(31L)
    }

    @Test
    @DisplayName("bulkActionForAdmin HARD_DELETE는 ID당 findDeletedSnapshotById를 1회만 호출한다")
    fun bulkHardDeleteQueriesDeletedSnapshotOncePerId() {
        val actor = member(1, "관리자")
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 33L,
                title = "벌크 영구삭제 대상",
                content = "본문 #tag",
                authorId = 4L,
                published = false,
                listed = false,
            )
        given(postRepository.findDeletedSnapshotById(33L)).willReturn(snapshot)
        given(postRepository.findDeletedSnapshotById(98L)).willReturn(null)
        given(postRepository.hardDeleteDeletedById(33L)).willReturn(true)

        val result = service.bulkActionForAdmin(actor, listOf(33L, 33L, 98L), AdmPostBulkActionType.HARD_DELETE)

        assertThat(result.processedCount).isEqualTo(1)
        assertThat(result.ids).containsExactly(33L)
        then(postRepository).should(times(1)).findDeletedSnapshotById(33L)
        then(postRepository).should(times(1)).findDeletedSnapshotById(98L)
        then(postRepository).should(times(1)).hardDeleteDeletedById(33L)
    }

    @Test
    @DisplayName("hardDeleteDeletedByIdForAdmin는 주입된 Clock으로 삭제 스냅샷 이벤트 시각을 생성한다")
    fun hardDeleteUsesInjectedClockForDeletedSnapshotEvent() {
        val fixedNow = Instant.parse("2026-11-22T12:34:56Z")
        val fixedClock = Clock.fixed(fixedNow, ZoneOffset.UTC)
        val serviceWithFixedClock =
            PostApplicationService(
                postRepository = postRepository,
                postWriteRequestIdempotencyRepository = postWriteRequestIdempotencyRepository,
                memberRepository = memberRepository,
                secureTipPort = secureTipPort,
                uploadedFileRetentionService = uploadedFileRetentionService,
                postRecommendRankingService = postRecommendRankingService,
                postKeywordSearchPipelineService = postKeywordSearchPipelineService,
                taskFacade = taskFacade,
                objectMapper = objectMapper,
                postHydrationService = postHydrationService,
                postCounterService = postCounterService,
                postTagIndexService = postTagIndexService,
                postTempDraftService = postTempDraftService,
                postHitSideEffectQueue = postHitSideEffectQueue,
                clock = fixedClock,
            )
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 34L,
                title = "시각 고정 영구삭제",
                content = "본문",
                authorId = 5L,
                published = false,
                listed = false,
            )
        given(postRepository.findDeletedSnapshotById(34L)).willReturn(snapshot)
        given(postRepository.hardDeleteDeletedById(34L)).willReturn(true)

        serviceWithFixedClock.hardDeleteDeletedByIdForAdmin(34L)

        val payload = capturePostWriteSideEffectPayload()
        val domainEvent = objectMapper.readValue(requireNotNull(payload.domainEventJson), PostDeletedEvent::class.java)
        assertThat(domainEvent.postDto.createdAt).isEqualTo(fixedNow)
        assertThat(domainEvent.postDto.modifiedAt).isEqualTo(fixedNow)
        assertThat(domainEvent.actorDto.createdAt).isEqualTo(fixedNow)
        assertThat(domainEvent.actorDto.modifiedAt).isEqualTo(fixedNow)
    }

    @Test
    @DisplayName("bulkActionForAdmin PUBLISH_LISTED는 이미 공개된 글의 불필요한 재저장을 건너뛰고 가시성 변경 항목만 배치 플러시·캐시 병합 무효화한다")
    fun bulkPublishListedSkipsAlreadyMatchingVisibilityAndBatchesFlush() {
        val author = member(1, "작성자")
        val alreadyListed =
            Post(id = 41L, author = author, title = "이미 공개", content = "tags: spring\n\n본문", published = true, listed = true).apply {
                createdAt = Instant.now()
                modifiedAt = createdAt
            }
        val draftPrivate =
            Post(id = 42L, author = author, title = "비공개 글 1", content = "tags: kotlin\n\n본문", published = false, listed = false).apply {
                createdAt = Instant.now()
                modifiedAt = createdAt
            }
        val unlistedPublic =
            Post(id = 43L, author = author, title = "링크 공개 글 2", content = "tags: java\n\n본문", published = true, listed = false).apply {
                createdAt = Instant.now()
                modifiedAt = createdAt
            }
        val revisionRepository =
            mock(com.back.boundedContexts.post.application.port.output.PostRevisionRepositoryPort::class.java)
        val feedCache = mock(org.springframework.cache.Cache::class.java)
        given(cacheManager.getCache(PostQueryCacheNames.FEED)).willReturn(feedCache)
        given(postRepository.findAllByIds(listOf(41L, 42L, 43L))).willReturn(listOf(alreadyListed, draftPrivate, unlistedPublic))
        given(postRepository.save(draftPrivate)).willReturn(draftPrivate)
        given(postRepository.save(unlistedPublic)).willReturn(unlistedPublic)

        val serviceWithRevisions =
            PostApplicationService(
                postRepository = postRepository,
                postWriteRequestIdempotencyRepository = postWriteRequestIdempotencyRepository,
                memberRepository = memberRepository,
                secureTipPort = secureTipPort,
                uploadedFileRetentionService = uploadedFileRetentionService,
                postRecommendRankingService = postRecommendRankingService,
                postKeywordSearchPipelineService = postKeywordSearchPipelineService,
                taskFacade = taskFacade,
                objectMapper = objectMapper,
                postHydrationService = postHydrationService,
                postCounterService = postCounterService,
                postTagIndexService = postTagIndexService,
                postTempDraftService = postTempDraftService,
                postHitSideEffectQueue = postHitSideEffectQueue,
                postReadCacheInvalidator = postReadCacheInvalidator,
                postRevisionRepository = revisionRepository,
            )

        val result = serviceWithRevisions.bulkActionForAdmin(author, listOf(41L, 42L, 43L), AdmPostBulkActionType.PUBLISH_LISTED)

        assertThat(result.processedCount).isEqualTo(3)
        assertThat(result.ids).containsExactly(41L, 42L, 43L)
        assertThat(draftPrivate.published).isTrue()
        assertThat(draftPrivate.listed).isTrue()
        assertThat(unlistedPublic.published).isTrue()
        assertThat(unlistedPublic.listed).isTrue()

        then(postRepository).should(never()).save(alreadyListed)
        then(postRepository).should(times(1)).save(draftPrivate)
        then(postRepository).should(times(1)).save(unlistedPublic)
        then(postRepository).should(never()).saveAndFlush(alreadyListed)
        then(postRepository).should(never()).saveAndFlush(draftPrivate)
        then(postRepository).should(never()).saveAndFlush(unlistedPublic)
        then(postRepository).should(times(1)).flush()
        verifyNoInteractions(revisionRepository)
        then(cacheManager).should(times(1)).getCache(PostQueryCacheNames.FEED)
        assertThat(postWriteSideEffectTasks()).hasSize(2)
    }

    @Test
    @DisplayName("리비전 목록·스냅샷 조회는 findById CLOB 로딩 대신 existsById로 존재 여부만 확인한다")
    fun revisionReadChecksExistenceWithoutLoadingPostClob() {
        val revisionRepository =
            mock(com.back.boundedContexts.post.application.port.output.PostRevisionRepositoryPort::class.java)
        val createdAt = Instant.parse("2026-11-20T00:00:00Z")
        val summary =
            com.back.boundedContexts.post.dto.PostRevisionSummaryDto(
                id = 91L,
                postId = 77L,
                title = "제목",
                summaryText = "요약",
                contentLength = 10,
                createdAt = createdAt,
            )
        val snapshot =
            com.back.boundedContexts.post.dto.PostRevisionSnapshotDto(
                id = 91L,
                postId = 77L,
                authorId = 1L,
                title = "제목",
                content = "본문",
                summaryText = "요약",
                createdAt = createdAt,
            )
        given(postRepository.existsById(77L)).willReturn(true)
        given(postRepository.existsById(88L)).willReturn(false)
        given(revisionRepository.findSummariesByPostId(77L, 20)).willReturn(listOf(summary))
        given(revisionRepository.findByPostIdAndRevisionId(77L, 91L)).willReturn(snapshot)

        val serviceWithRevisions =
            PostApplicationService(
                postRepository = postRepository,
                postWriteRequestIdempotencyRepository = postWriteRequestIdempotencyRepository,
                memberRepository = memberRepository,
                secureTipPort = secureTipPort,
                uploadedFileRetentionService = uploadedFileRetentionService,
                postRecommendRankingService = postRecommendRankingService,
                postKeywordSearchPipelineService = postKeywordSearchPipelineService,
                taskFacade = taskFacade,
                objectMapper = objectMapper,
                postHydrationService = postHydrationService,
                postCounterService = postCounterService,
                postTagIndexService = postTagIndexService,
                postTempDraftService = postTempDraftService,
                postHitSideEffectQueue = postHitSideEffectQueue,
                postRevisionRepository = revisionRepository,
            )

        assertThat(serviceWithRevisions.getPostRevisionsForAdmin(77L)).containsExactly(summary)
        assertThat(serviceWithRevisions.getPostRevisionSnapshotForAdmin(77L, 91L)).isEqualTo(snapshot)
        assertThatThrownBy { serviceWithRevisions.getPostRevisionsForAdmin(88L) }
            .isInstanceOf(NoSuchElementException::class.java)
        assertThatThrownBy { serviceWithRevisions.getPostRevisionSnapshotForAdmin(88L, 91L) }
            .isInstanceOf(NoSuchElementException::class.java)

        then(postRepository).should(never()).findById(77L)
        then(postRepository).should(never()).findById(88L)
    }

    @Test
    @DisplayName("restorePostRevisionForAdmin은 expectedVersion 불일치 또는 낙관적 락 충돌 시 POST_CONCURRENT_EDIT 예외를 발생시킨다")
    fun restorePostRevisionForAdminRejectsVersionMismatchAndOptimisticLockConflict() {
        val author = member(1L, "작성자")
        val post =
            Post(id = 77L, author = author, title = "원본", content = "원본 본문", published = false, listed = false).apply {
                version = 4L
            }
        val revisionRepository = mock(com.back.boundedContexts.post.application.port.output.PostRevisionRepositoryPort::class.java)
        val snapshot =
            com.back.boundedContexts.post.dto.PostRevisionSnapshotDto(
                id = 91L,
                postId = 77L,
                authorId = 1L,
                title = "복원 제목",
                content = "복원 본문",
                summaryText = null,
                createdAt = Instant.now(),
            )
        given(postRepository.findById(77L)).willReturn(Optional.of(post))
        given(revisionRepository.findByPostIdAndRevisionId(77L, 91L)).willReturn(snapshot)
        given(postRepository.flush()).willThrow(org.springframework.orm.ObjectOptimisticLockingFailureException(Post::class.java, 77L))

        val serviceWithRevisions =
            PostApplicationService(
                postRepository = postRepository,
                postWriteRequestIdempotencyRepository = postWriteRequestIdempotencyRepository,
                memberRepository = memberRepository,
                secureTipPort = secureTipPort,
                uploadedFileRetentionService = uploadedFileRetentionService,
                postRecommendRankingService = postRecommendRankingService,
                postKeywordSearchPipelineService = postKeywordSearchPipelineService,
                taskFacade = taskFacade,
                objectMapper = objectMapper,
                postHydrationService = postHydrationService,
                postCounterService = postCounterService,
                postTagIndexService = postTagIndexService,
                postTempDraftService = postTempDraftService,
                postHitSideEffectQueue = postHitSideEffectQueue,
                postRevisionRepository = revisionRepository,
            )

        assertThatThrownBy {
            serviceWithRevisions.restorePostRevisionForAdmin(author, 77L, 91L, expectedVersion = 3L)
        }.isInstanceOf(AppException::class.java)
            .extracting("errorCode")
            .isEqualTo(ErrorCode.POST_CONCURRENT_EDIT)

        then(revisionRepository).should(never()).findByPostIdAndRevisionId(77L, 91L)

        assertThatThrownBy {
            serviceWithRevisions.restorePostRevisionForAdmin(author, 77L, 91L, expectedVersion = 4L)
        }.isInstanceOf(AppException::class.java)
            .extracting("errorCode")
            .isEqualTo(ErrorCode.POST_CONCURRENT_EDIT)
    }

    private fun capturePostWriteSideEffectPayload(): PostWriteSideEffectPayload {
        val task = postWriteSideEffectTasks().single()
        return decodePostWritePayload(task)
    }

    private fun capturePostWriteSideEffectPayloads(): List<PostWriteSideEffectPayload> =
        postWriteSideEffectTasks()
            .map(::decodePostWritePayload)

    private fun decodePostWritePayload(task: Task): PostWriteSideEffectPayload {
        val envelope = objectMapper.readValue(task.payload, TaskPayloadEnvelope::class.java)
        return objectMapper.readValue(envelope.payloadJson, PostWriteSideEffectPayload::class.java)
    }

    private fun postWriteSideEffectTasks(): List<Task> =
        taskRepository.savedTasks.filter { it.taskType == PostWriteSideEffectPayload.TASK_TYPE }

    private fun postWriteTaskHandlerRegistry(): TaskHandlerRegistry {
        val registry = TaskHandlerRegistry()
        registry.register(
            PostWriteSideEffectPayload.TASK_TYPE,
            TaskHandlerEntry.withCurrentDecoder(
                taskType = PostWriteSideEffectPayload.TASK_TYPE,
                payloadClass = PostWriteSideEffectPayload::class.java,
                handlerMethod =
                    TaskHandlerMethod(
                        bean = postWriteSideEffectHandler,
                        method =
                            PostWriteSideEffectHandler::class.java.getDeclaredMethod(
                                "handle",
                                PostWriteSideEffectPayload::class.java,
                            ),
                    ),
                retryPolicy = TaskRetryPolicy("post write", 5, 10, 2.0, 300),
                schemaVersion = 2,
                sensitivity = TaskPayloadSensitivity.PERSONAL,
            ),
        )
        registry.register(
            PostHitSideEffectPayload.TASK_TYPE,
            TaskHandlerEntry.withCurrentDecoder(
                taskType = PostHitSideEffectPayload.TASK_TYPE,
                payloadClass = PostHitSideEffectPayload::class.java,
                handlerMethod =
                    TaskHandlerMethod(
                        bean = mock(PostHitSideEffectHandler::class.java),
                        method =
                            PostHitSideEffectHandler::class.java.getDeclaredMethod(
                                "handle",
                                PostHitSideEffectPayload::class.java,
                            ),
                    ),
                retryPolicy = TaskRetryPolicy("post hit", 3, 5, 2.0, 60),
                schemaVersion = 2,
                sensitivity = TaskPayloadSensitivity.PUBLIC,
            ),
        )
        return registry
    }

    private class RecordingTaskQueueRepository :
        TaskQueueRepositoryPort,
        TaskQueueInsertPort {
        val savedTasks = mutableListOf<Task>()

        override fun insertIfAbsent(task: Task): TaskQueueInsertResult {
            if (savedTasks.any { it.uid == task.uid }) return TaskQueueInsertResult.DUPLICATE
            savedTasks += task
            return TaskQueueInsertResult.INSERTED
        }

        override fun save(task: Task): Task {
            savedTasks += task
            return task
        }

        override fun saveAllTasks(tasks: Collection<Task>): List<Task> = tasks.map(::save)

        override fun summarizeQueueSnapshotByTaskType(
            now: Instant,
            stuckBefore: Instant,
        ): List<TaskTypeQueueSnapshotAggregate> = unsupported()

        override fun summarizeCountsByTaskTypeAndStatus(): List<TaskTypeStatusAggregate> = unsupported()

        override fun summarizeReadyPendingByTaskType(
            status: TaskStatus,
            now: Instant,
        ): List<TaskTypeReadyAggregate> = unsupported()

        override fun countStaleProcessingByTaskType(
            status: TaskStatus,
            modifiedAt: Instant,
        ): List<TaskTypeCountAggregate> = unsupported()

        override fun findLatestFailedTasksByTaskType(): List<Task> = unsupported()

        override fun countByStatus(status: TaskStatus): Long = unsupported()

        override fun countByStatusAndNextRetryAtLessThanEqual(
            status: TaskStatus,
            nextRetryAt: Instant,
        ): Long = unsupported()

        override fun countByStatusAndModifiedAtBefore(
            status: TaskStatus,
            modifiedAt: Instant,
        ): Long = unsupported()

        override fun countByTaskTypeAndStatus(
            taskType: String,
            status: TaskStatus,
        ): Long = unsupported()

        override fun countByTaskTypeAndStatusAndNextRetryAtLessThanEqual(
            taskType: String,
            status: TaskStatus,
            nextRetryAt: Instant,
        ): Long = unsupported()

        override fun countByTaskTypeAndStatusAndModifiedAtBefore(
            taskType: String,
            status: TaskStatus,
            modifiedAt: Instant,
        ): Long = unsupported()

        override fun findByStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
            status: TaskStatus,
            nextRetryAt: Instant,
            pageable: Pageable,
        ): List<Task> = unsupported()

        override fun findByStatusOrderByModifiedAtAsc(
            status: TaskStatus,
            pageable: Pageable,
        ): List<Task> = unsupported()

        override fun findByStatusOrderByModifiedAtDesc(
            status: TaskStatus,
            pageable: Pageable,
        ): List<Task> = unsupported()

        override fun findByStatusAndModifiedAtBeforeOrderByModifiedAtAsc(
            status: TaskStatus,
            modifiedAt: Instant,
            pageable: Pageable,
        ): List<Task> = unsupported()

        override fun findByTaskTypeAndStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
            taskType: String,
            status: TaskStatus,
            nextRetryAt: Instant,
            pageable: Pageable,
        ): List<Task> = unsupported()

        override fun findByTaskTypeAndStatusOrderByModifiedAtDesc(
            taskType: String,
            status: TaskStatus,
            pageable: Pageable,
        ): List<Task> = unsupported()

        private fun <T> unsupported(): T = throw UnsupportedOperationException("not needed in this test")
    }

    private class NoopTransactionManager : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()

        @Throws(TransactionException::class)
        override fun commit(status: TransactionStatus) = Unit

        @Throws(TransactionException::class)
        override fun rollback(status: TransactionStatus) = Unit
    }
}
