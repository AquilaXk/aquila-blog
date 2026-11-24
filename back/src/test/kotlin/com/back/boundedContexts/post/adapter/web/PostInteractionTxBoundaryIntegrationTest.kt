package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.standard.extensions.getOrThrow
import com.back.support.BaseSeededIntegrationTest
import com.back.support.RedisTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.cache.CacheManager
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

@AutoConfigureMockMvc
@DisplayName("비트랜잭션 open-in-view=false 환경 게시글 상호작용·상세 조회 경계 통합 테스트")
class PostInteractionTxBoundaryIntegrationTest : BaseSeededIntegrationTest() {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var postUseCase: PostUseCase

    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var transactionTemplate: TransactionTemplate

    @Autowired
    private lateinit var redisTemplate: StringRedisTemplate

    @Autowired
    private lateinit var cacheManager: CacheManager

    @Autowired
    private lateinit var postRepository: PostRepositoryPort

    @Autowired
    private lateinit var postAttrRepository: PostAttrRepositoryPort

    @Autowired
    private lateinit var postLikeRepository: PostLikeRepositoryPort

    @Autowired
    private lateinit var transactionManager: PlatformTransactionManager

    @AfterEach
    fun cleanup() {
        RedisTestSupport.clearKeys(redisTemplate, "post:hit:viewed:*")
        RedisTestSupport.clearKeys(redisTemplate, "post:like:liked:*")
        cacheManager.cacheNames.forEach { cacheManager.getCache(it)?.clear() }
    }

    @Test
    @DisplayName("hit/like/unlike 반복 요청은 기존 PostAttr이 존재할 때도 open-in-view=false에서 LazyInitializationException 없이 동작한다")
    fun repeatedInteractionsWorkWithoutOuterTransactionWhenAttrsExist() {
        val author = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
        val post =
            transactionTemplate.execute {
                postUseCase.write(
                    author = author,
                    title = "비트랜잭션 카운터 테스트",
                    content = "tags: tx\n\n본문입니다.",
                    published = true,
                    listed = true,
                    summaryMode = PostSummaryMode.AUTO,
                )
            }!!

        // 1차 조회수 증가: hitCountAttr rows 생성
        mvc
            .post("/post/api/v1/posts/${post.id}/hit") {
                with { req ->
                    req.remoteAddr = "203.0.113.10"
                    req
                }
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.hitCount") { value(1) }
            }

        // 2차 조회수 증가(다른 viewer): 이미 hitCountAttr가 DB에 연결된 상태에서 별도 트랜잭션 findById + incrementHit 실행
        mvc
            .post("/post/api/v1/posts/${post.id}/hit") {
                with { req ->
                    req.remoteAddr = "203.0.113.11"
                    req
                }
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.hitCount") { value(2) }
            }

        // 동일 viewer 재요청(dedup skip)
        mvc
            .post("/post/api/v1/posts/${post.id}/hit") {
                with { req ->
                    req.remoteAddr = "203.0.113.11"
                    req
                }
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.hitCount") { value(2) }
            }

        // 1차 & 2차 좋아요 증가 + 취소: likesCountAttr 생성 후 및 기존 존재 시 모두 안전 동작
        mvc
            .put("/post/api/v1/posts/${post.id}/like") {
                with { req ->
                    req.remoteAddr = "203.0.113.20"
                    req
                }
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.liked") { value(true) }
                jsonPath("$.data.likesCount") { value(1) }
            }

        mvc
            .put("/post/api/v1/posts/${post.id}/like") {
                with { req ->
                    req.remoteAddr = "203.0.113.21"
                    req
                }
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.liked") { value(true) }
                jsonPath("$.data.likesCount") { value(2) }
            }

        mvc
            .delete("/post/api/v1/posts/${post.id}/like") {
                with { req ->
                    req.remoteAddr = "203.0.113.21"
                    req
                }
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.liked") { value(false) }
                jsonPath("$.data.likesCount") { value(1) }
            }
    }

    @Test
    @WithUserDetails("user1@test.com")
    @DisplayName("인증된 작성자는 open-in-view=false에서도 비공개 글 상세를 LazyInitializationException 없이 조회한다")
    fun authenticatedDetailReadWorksWithoutControllerTransaction() {
        val author = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
        val privatePost =
            transactionTemplate.execute {
                postUseCase.write(
                    author = author,
                    title = "비공개 상세 테스트",
                    content = "tags: private\n\n비공개 본문입니다.",
                    published = false,
                    listed = false,
                    summaryMode = PostSummaryMode.AUTO,
                )
            }!!

        mvc.get("/post/api/v1/posts/${privatePost.id}").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(privatePost.id) }
            jsonPath("$.title") { value("비공개 상세 테스트") }
            jsonPath("$.actorCanModify") { value(true) }
            jsonPath("$.actorCanDelete") { value(true) }
        }

        val reloaded = postUseCase.findById(privatePost.id)
        assertThat(reloaded).isNotNull()
    }

    @Test
    @DisplayName("익명 미존재 상세 요청은 음수 캐시 적재 후에도 반복 404를 안정적으로 반환한다")
    fun anonymousMissingDetailReturns404WithNegativeCache() {
        mvc.get("/post/api/v1/posts/999999999").andExpect {
            status { isNotFound() }
        }
        mvc.get("/post/api/v1/posts/999999999").andExpect {
            status { isNotFound() }
        }
    }

    @Test
    @DisplayName("동일 게시글 동시 다중 좋아요 취소는 lockByIdForUpdate로 직렬화되어 팬텀 +1 복원 없이 0으로 수렴한다")
    fun concurrentMultiUnlikeSerializesOnPostRowLockAndConvergesToZero() {
        val author = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
        val secondMember = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
        val post =
            transactionTemplate.execute {
                postUseCase.write(
                    author = author,
                    title = "동시 좋아요 취소 직렬화 테스트",
                    content = "tags: lock\n\n동시성 검증 본문입니다.",
                    published = true,
                    listed = true,
                    summaryMode = PostSummaryMode.AUTO,
                )
            }

        assertThat(postUseCase.likePost(post.id, author.id)).isEqualTo(1)
        assertThat(postUseCase.incrementLike(post.id)).isEqualTo(2)

        val lockedByTx1 = CountDownLatch(1)
        val tx1Committed = AtomicBoolean(false)
        val requiredTemplate =
            TransactionTemplate(transactionManager).apply {
                propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRED
            }
        val executor = Executors.newFixedThreadPool(2)
        try {
            val tx1Future =
                executor.submit {
                    requiredTemplate.executeWithoutResult {
                        postRepository.lockByIdForUpdate(post.id)
                        postLikeRepository.deleteByLikerIdAndPostId(author.id, post.id)
                        lockedByTx1.countDown()
                        Thread.sleep(150)
                        val updated = postAttrRepository.incrementIntValueBySubjectId(post.id, LIKES_COUNT, -1)
                        postRepository.updateLikesCountById(post.id, updated)
                    }
                    tx1Committed.set(true)
                }

            val tx2Future =
                executor.submit<Pair<Boolean, Int>> {
                    check(lockedByTx1.await(10, TimeUnit.SECONDS)) { "tx1 lock wait timed out" }
                    val updated = postUseCase.decrementLike(post.id)
                    tx1Committed.get() to updated
                }

            tx1Future.get(20, TimeUnit.SECONDS)
            val (sawCommittedTx1, tx2Result) = tx2Future.get(20, TimeUnit.SECONDS)
            assertThat(sawCommittedTx1).isTrue()
            assertThat(tx2Result).isEqualTo(0)
        } finally {
            executor.shutdownNow()
            assertThat(executor.awaitTermination(10, TimeUnit.SECONDS)).isTrue()
        }

        assertLikesConvergedToZero(post)

        // 두 번째 동시 다중 취소 버스트: 회원 2명 + 익명 1건 -> 동시 unlike 5건 실행 후 정확히 0 수렴
        assertThat(postUseCase.likePost(post.id, author.id)).isEqualTo(1)
        assertThat(postUseCase.likePost(post.id, secondMember.id)).isEqualTo(2)
        assertThat(postUseCase.incrementLike(post.id)).isEqualTo(3)

        val burstPool = Executors.newFixedThreadPool(5)
        val ready = CountDownLatch(5)
        val start = CountDownLatch(1)
        try {
            val actions =
                listOf(
                    { postUseCase.unlikePost(post.id, author.id) },
                    { postUseCase.unlikePost(post.id, secondMember.id) },
                    { postUseCase.decrementLike(post.id) },
                    { postUseCase.unlikePost(post.id, author.id) },
                    { postUseCase.decrementLike(post.id) },
                )
            val futures =
                actions.map { action ->
                    burstPool.submit<Int> {
                        ready.countDown()
                        check(start.await(10, TimeUnit.SECONDS)) { "burst start timed out" }
                        action()
                    }
                }
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue()
            start.countDown()
            futures.forEach { it.get(20, TimeUnit.SECONDS) }
        } finally {
            burstPool.shutdownNow()
            assertThat(burstPool.awaitTermination(10, TimeUnit.SECONDS)).isTrue()
        }

        assertLikesConvergedToZero(post)
    }

    private fun assertLikesConvergedToZero(post: Post) {
        assertThat(postUseCase.findInteractionReadStateById(post.id)?.likesCount).isZero()
        assertThat(postLikeRepository.countByPostId(post.id)).isZero()
        val attrValue =
            transactionTemplate.execute {
                postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)?.intValue
            }
        assertThat(attrValue).isZero()
    }
}
