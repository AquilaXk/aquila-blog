package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.boundedContexts.post.application.service.PostReadCacheInvalidationTarget
import com.back.boundedContexts.post.application.service.PostScheduledPublishExecutor
import com.back.boundedContexts.post.application.service.PostWriteSideEffectPayload
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.global.security.domain.SecurityUser
import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.application.TaskPayloadEnvelope
import com.back.standard.extensions.getOrThrow
import com.back.support.BaseSeededIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.cache.CacheManager
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

@AutoConfigureMockMvc
@DisplayName("예약 발행과 삭제 간 PostgreSQL 행 잠금 직렬화 통합 테스트")
class PostScheduledPublishConcurrencyIntegrationTest : BaseSeededIntegrationTest() {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var postFacade: PostApplicationService

    @Autowired
    private lateinit var scheduledPublishExecutor: PostScheduledPublishExecutor

    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var postRepository: PostRepositoryPort

    @Autowired
    private lateinit var taskRepository: TaskRepository

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @Autowired
    private lateinit var transactionTemplate: TransactionTemplate

    @Autowired
    private lateinit var transactionManager: PlatformTransactionManager

    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    private lateinit var cacheManager: CacheManager

    @AfterEach
    fun cleanupCaches() {
        cacheManager.cacheNames.forEach { cacheManager.getCache(it)?.clear() }
    }

    @Test
    @DisplayName("예약 발행이 먼저 잠금을 잡으면 동시 DELETE는 행 잠금 대기 후 발행된 공개 상태를 반영해 캐시를 무효화한다")
    fun deleteBlocksUntilScheduledPublishCommitsAndEmitsPublicDeletionSideEffect() {
        val admin = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
        val dueAt = Instant.now().plus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS)
        val post =
            requireNotNull(
                transactionTemplate.execute {
                    postFacade.write(
                        author = admin,
                        title = "동시성 예약 발행-삭제 테스트",
                        content = "tags: [concurrency]\n\n예약 발행과 삭제가 동시에 발생할 수 있습니다.",
                        published = false,
                        listed = true,
                        summaryMode = PostSummaryMode.AUTO,
                        scheduledAt = dueAt,
                    )
                },
            )
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()
        val adminSecurityUser =
            SecurityUser(
                id = admin.id,
                username = admin.username,
                password = "",
                nickname = admin.nickname,
                authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN"), SimpleGrantedAuthority("ROLE_MEMBER")),
            )

        val lockedByPublishTx = CountDownLatch(1)
        val deleteStarted = CountDownLatch(1)
        val publishReadyToCommit = AtomicBoolean(false)
        val sawDeleteLockWait = AtomicBoolean(false)
        val requiredTemplate =
            TransactionTemplate(transactionManager).apply {
                propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRED
            }
        val executor = Executors.newFixedThreadPool(2)
        try {
            val publishFuture =
                executor.submit<Boolean> {
                    requireNotNull(
                        requiredTemplate.execute {
                            val published = scheduledPublishExecutor.publishDuePost(post.id, dueAt.plusSeconds(10))
                            lockedByPublishTx.countDown()
                            check(deleteStarted.await(10, TimeUnit.SECONDS)) { "delete thread start timed out" }
                            awaitBlockedPostgresLock(sawDeleteLockWait)
                            publishReadyToCommit.set(true)
                            published
                        },
                    )
                }

            val deleteFuture =
                executor.submit<Pair<Boolean, Int>> {
                    check(lockedByPublishTx.await(10, TimeUnit.SECONDS)) { "publish lock wait timed out" }
                    deleteStarted.countDown()
                    val status =
                        mvc
                            .delete("/post/api/v1/posts/${post.id}") {
                                with(user(adminSecurityUser))
                            }.andReturn()
                            .response
                            .status
                    publishReadyToCommit.get() to status
                }

            assertThat(publishFuture.get(20, TimeUnit.SECONDS)).isTrue()
            val (sawCommittedPublish, deleteStatus) = deleteFuture.get(20, TimeUnit.SECONDS)
            assertThat(sawDeleteLockWait.get()).isTrue()
            assertThat(sawCommittedPublish).isTrue()
            assertThat(deleteStatus).isEqualTo(200)
        } finally {
            executor.shutdownNow()
            assertThat(executor.awaitTermination(10, TimeUnit.SECONDS)).isTrue()
        }

        val deletedSnapshot = postRepository.findDeletedSnapshotById(post.id)
        assertThat(deletedSnapshot).isNotNull()
        assertThat(deletedSnapshot!!.published).isTrue()
        assertThat(deletedSnapshot.listed).isTrue()

        val sideEffectPayloads =
            taskRepository
                .findAll()
                .filter { it.id !in previousTaskIds && it.taskType == PostWriteSideEffectPayload.TASK_TYPE }
                .map { task ->
                    val envelope = objectMapper.readValue(task.payload, TaskPayloadEnvelope::class.java)
                    objectMapper.readValue(envelope.payloadJson, PostWriteSideEffectPayload::class.java)
                }
        val deletePayload = sideEffectPayloads.first { it.evictReason == "soft-delete" }
        assertThat(deletePayload.cacheInvalidationTargets)
            .contains(PostReadCacheInvalidationTarget.HOT_READ_PAGES, PostReadCacheInvalidationTarget.DETAIL)
        val deletedEvent = objectMapper.readValue(deletePayload.domainEventJson!!, PostDeletedEvent::class.java)
        assertThat(deletedEvent.postDto.published).isTrue()
        assertThat(deletedEvent.postDto.listed).isTrue()
    }

    @Test
    @DisplayName("softDelete가 먼저 잠금을 잡으면 동시 publishDuePost는 행 잠금 대기 후 삭제를 감지해 발행을 건너뛴다")
    fun scheduledPublishBlocksOnSoftDeleteAndSkipsDeletedPost() {
        val admin = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
        val dueAt = Instant.now().plus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS)
        val post =
            requireNotNull(
                transactionTemplate.execute {
                    postFacade.write(
                        author = admin,
                        title = "삭제 우선 동시성 테스트",
                        content = "tags: [concurrency]\n\n삭제가 먼저 잠금을 획득하면 발행되지 않아야 합니다.",
                        published = false,
                        listed = true,
                        summaryMode = PostSummaryMode.AUTO,
                        scheduledAt = dueAt,
                    )
                },
            )
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()

        val lockedByDeleteTx = CountDownLatch(1)
        val publishStarted = CountDownLatch(1)
        val deleteReadyToCommit = AtomicBoolean(false)
        val sawPublishLockWait = AtomicBoolean(false)
        val requiredTemplate =
            TransactionTemplate(transactionManager).apply {
                propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRED
            }
        val executor = Executors.newFixedThreadPool(2)
        try {
            val deleteFuture =
                executor.submit<Boolean> {
                    requireNotNull(
                        requiredTemplate.execute {
                            val deleted = postRepository.softDeleteById(post.id)
                            lockedByDeleteTx.countDown()
                            check(publishStarted.await(10, TimeUnit.SECONDS)) { "publish thread start timed out" }
                            awaitBlockedPostgresLock(sawPublishLockWait)
                            deleteReadyToCommit.set(true)
                            deleted
                        },
                    )
                }

            val publishFuture =
                executor.submit<Pair<Boolean, Boolean>> {
                    check(lockedByDeleteTx.await(10, TimeUnit.SECONDS)) { "delete lock wait timed out" }
                    publishStarted.countDown()
                    val published = scheduledPublishExecutor.publishDuePost(post.id, dueAt.plusSeconds(10))
                    deleteReadyToCommit.get() to published
                }

            assertThat(deleteFuture.get(20, TimeUnit.SECONDS)).isTrue()
            val (sawCommittedDelete, publishedResult) = publishFuture.get(20, TimeUnit.SECONDS)
            assertThat(sawPublishLockWait.get()).isTrue()
            assertThat(sawCommittedDelete).isTrue()
            assertThat(publishedResult).isFalse()
        } finally {
            executor.shutdownNow()
            assertThat(executor.awaitTermination(10, TimeUnit.SECONDS)).isTrue()
        }

        val deletedSnapshot = postRepository.findDeletedSnapshotById(post.id)
        assertThat(deletedSnapshot).isNotNull()
        assertThat(deletedSnapshot!!.published).isFalse()

        val sideEffectPayloads =
            taskRepository
                .findAll()
                .filter { it.id !in previousTaskIds && it.taskType == PostWriteSideEffectPayload.TASK_TYPE }
                .map { task ->
                    val envelope = objectMapper.readValue(task.payload, TaskPayloadEnvelope::class.java)
                    objectMapper.readValue(envelope.payloadJson, PostWriteSideEffectPayload::class.java)
                }
        assertThat(sideEffectPayloads.filter { it.domainEventType == PostWrittenEvent::class.java.name }).isEmpty()
    }

    private fun awaitBlockedPostgresLock(sawBlockedFlag: AtomicBoolean) {
        val waitDeadlineNanos = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (System.nanoTime() < waitDeadlineNanos) {
            val blockedCount =
                jdbcTemplate.queryForObject("SELECT count(*) FROM pg_locks WHERE NOT granted", Long::class.java) ?: 0L
            if (blockedCount > 0L) {
                sawBlockedFlag.set(true)
                return
            }
            Thread.sleep(10)
        }
    }
}
