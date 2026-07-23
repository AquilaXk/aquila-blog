package com.back.boundedContexts.post.application.service

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostLike
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.slf4j.LoggerFactory
import java.time.Instant

@DisplayName("핵심 상태변경 유스케이스 info 로그 컨벤션")
class ServiceInfoLoggingTest {
    @Test
    @DisplayName("post_like_completed는 postId/actorId/likeId만 남기고 민감키를 포함하지 않는다")
    fun `post like logs completed event with domain ids`() {
        val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
        val postLikeRepository: PostLikeRepositoryPort = mock(PostLikeRepositoryPort::class.java)
        val hydrationService: PostHydrationService = mock(PostHydrationService::class.java)
        val counterService: PostCounterService = mock(PostCounterService::class.java)
        val sideEffectQueue: PostInteractionSideEffectQueue = mock(PostInteractionSideEffectQueue::class.java)
        val service =
            PostLikeApplicationService(
                postRepository = postRepository,
                postLikeRepository = postLikeRepository,
                postHydrationService = hydrationService,
                postCounterService = counterService,
                postInteractionSideEffectQueue = sideEffectQueue,
            )
        val actor = testMember(id = 7)
        val post = testPost(id = 42, author = testMember(id = 1))
        val existingLike = PostLike(99, actor, post)
        // 이미 좋아요된 경로는 MemberDto/AppConfig에 의존하지 않아 전역 설정을 오염시키지 않는다.
        given(postLikeRepository.insertIfAbsent(actor, post)).willReturn(null)
        given(postLikeRepository.findByLikerAndPost(actor, post)).willReturn(existingLike)

        val appender = attachListAppender(PostLikeApplicationService::class.java)
        try {
            service.like(post, actor)
        } finally {
            detachListAppender(PostLikeApplicationService::class.java, appender)
        }

        val message = appender.list.map { it.formattedMessage }.single { it.contains("post_like_completed") }
        assertThat(message)
            .contains("post_like_completed")
            .contains("postId=42")
            .contains("actorId=7")
            .contains("likeId=99")
            .doesNotContain("requestId")
            .doesNotContain("email")
            .doesNotContain("token")
            .doesNotContain("본문")
    }

    @Test
    @DisplayName("post_unlike_completed는 postId/actorId/likeId를 남긴다")
    fun `post unlike logs completed event with domain ids`() {
        val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
        val postLikeRepository: PostLikeRepositoryPort = mock(PostLikeRepositoryPort::class.java)
        val hydrationService: PostHydrationService = mock(PostHydrationService::class.java)
        val counterService: PostCounterService = mock(PostCounterService::class.java)
        val sideEffectQueue: PostInteractionSideEffectQueue = mock(PostInteractionSideEffectQueue::class.java)
        val service =
            PostLikeApplicationService(
                postRepository = postRepository,
                postLikeRepository = postLikeRepository,
                postHydrationService = hydrationService,
                postCounterService = counterService,
                postInteractionSideEffectQueue = sideEffectQueue,
            )
        val actor = testMember(id = 7)
        val post = testPost(id = 42, author = testMember(id = 1))
        // 좋아요가 없는 unlike는 MemberDto 생성 없이 완료 로그만 검증한다.
        given(postLikeRepository.findByLikerAndPost(actor, post)).willReturn(null)
        given(postLikeRepository.deleteByLikerAndPost(actor, post)).willReturn(0)

        val appender = attachListAppender(PostLikeApplicationService::class.java)
        try {
            service.unlike(post, actor)
        } finally {
            detachListAppender(PostLikeApplicationService::class.java, appender)
        }

        val message = appender.list.map { it.formattedMessage }.single { it.contains("post_unlike_completed") }
        assertThat(message)
            .contains("post_unlike_completed")
            .contains("postId=42")
            .contains("actorId=7")
            .contains("likeId=0")
            .doesNotContain("requestId")
    }

    private fun attachListAppender(loggerClass: Class<*>): ListAppender<ILoggingEvent> {
        val logger = LoggerFactory.getLogger(loggerClass) as Logger
        return ListAppender<ILoggingEvent>().also {
            it.start()
            logger.addAppender(it)
        }
    }

    private fun detachListAppender(
        loggerClass: Class<*>,
        appender: ListAppender<ILoggingEvent>,
    ) {
        val logger = LoggerFactory.getLogger(loggerClass) as Logger
        logger.detachAppender(appender)
    }

    private fun testMember(id: Long = 1): Member =
        Member(id = id, username = "user-$id", nickname = "작성자$id", apiKey = "api-key-$id").also {
            val now = Instant.now()
            it.createdAt = now
            it.modifiedAt = now
        }

    private fun testPost(
        id: Long = 10,
        author: Member = testMember(),
    ): Post =
        Post(
            id = id,
            author = author,
            title = "제목$id",
            content = "본문$id",
            published = true,
            listed = true,
        ).also {
            val now = Instant.now()
            it.createdAt = now
            it.modifiedAt = now
        }
}
