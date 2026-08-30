package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.application.port.output.AdminEmailChallengeStore
import com.back.support.BaseSeededIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Duration
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class RedisAdminEmailChallengeStoreIntegrationTest : BaseSeededIntegrationTest() {
    @Autowired
    private lateinit var store: AdminEmailChallengeStore

    @Autowired
    private lateinit var redisTemplate: StringRedisTemplate

    @Test
    fun `challenge consume is atomic preserves ttl on mismatch exhausts and request slot is global`() {
        val challengeId = "admin-email-${System.nanoTime()}"
        val codeHash = "correct-hash"
        issue(challengeId, codeHash)
        val key = challengeKey(challengeId)
        val beforeWrongAttempt = redisTemplate.getExpire(key, TimeUnit.MILLISECONDS)

        assertThat(store.consume(challengeId, "wrong-hash", maxFailedAttempts = 2))
            .isEqualTo(AdminEmailChallengeStore.ConsumeResult.Invalid)
        val afterWrongAttempt = redisTemplate.getExpire(key, TimeUnit.MILLISECONDS)
        assertThat(afterWrongAttempt).isPositive().isLessThanOrEqualTo(beforeWrongAttempt)

        val callersReady = CountDownLatch(2)
        val releaseCallers = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val results =
                List(2) {
                    executor.submit(
                        Callable {
                            callersReady.countDown()
                            check(releaseCallers.await(5, TimeUnit.SECONDS))
                            store.consume(challengeId, codeHash, maxFailedAttempts = 2)
                        },
                    )
                }
            assertThat(callersReady.await(5, TimeUnit.SECONDS)).isTrue()
            releaseCallers.countDown()

            assertThat(results.map { it.get(5, TimeUnit.SECONDS) })
                .containsExactlyInAnyOrder(
                    AdminEmailChallengeStore.ConsumeResult.Matched(memberId = MEMBER_ID, rememberMe = true),
                    AdminEmailChallengeStore.ConsumeResult.Invalid,
                )
        } finally {
            executor.shutdownNow()
        }

        val exhaustedId = "admin-email-exhausted-${System.nanoTime()}"
        issue(exhaustedId, "another-hash")
        assertThat(store.consume(exhaustedId, "wrong-hash", maxFailedAttempts = 2))
            .isEqualTo(AdminEmailChallengeStore.ConsumeResult.Invalid)
        assertThat(store.consume(exhaustedId, "wrong-hash", maxFailedAttempts = 2))
            .isEqualTo(AdminEmailChallengeStore.ConsumeResult.Exhausted)
        assertThat(redisTemplate.hasKey(challengeKey(exhaustedId))).isFalse()

        val expiredId = "admin-email-expired-${System.nanoTime()}"
        issue(expiredId, "expired-hash", ttl = Duration.ofSeconds(1))
        Thread.sleep(1_100)
        assertThat(store.consume(expiredId, "expired-hash", maxFailedAttempts = 2))
            .isEqualTo(AdminEmailChallengeStore.ConsumeResult.Invalid)
        assertThat(redisTemplate.hasKey(challengeKey(expiredId))).isFalse()

        val recipientHash = "recipient-${System.nanoTime()}"
        assertThat(store.acquireRequestSlot(recipientHash, maxRequests = 1, window = Duration.ofMinutes(10))).isTrue()
        assertThat(store.acquireRequestSlot(recipientHash, maxRequests = 1, window = Duration.ofMinutes(10))).isFalse()
    }

    private fun issue(
        challengeId: String,
        codeHash: String,
        ttl: Duration = Duration.ofMinutes(2),
    ) {
        store.issue(
            AdminEmailChallengeStore.Challenge(
                challengeId = challengeId,
                codeHash = codeHash,
                memberId = MEMBER_ID,
                rememberMe = true,
                ttl = ttl,
            ),
        )
    }

    private fun challengeKey(challengeId: String) = "auth:admin-email:challenge:$challengeId"

    private companion object {
        private const val MEMBER_ID = 1L
    }
}
