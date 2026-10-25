package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.application.port.output.AdminEmailChallengeStore
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.eq
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.RedisScript
import java.time.Duration
import java.util.stream.Stream

class RedisAdminEmailChallengeStoreTest {
    @Test
    fun `null Redis script result is an invalid challenge`() {
        val redisTemplate = mock(StringRedisTemplate::class.java)
        val store = RedisAdminEmailChallengeStore(objectProvider(redisTemplate))

        assertThat(store.consume("challenge", "hash", maxFailedAttempts = 5))
            .isEqualTo(AdminEmailChallengeStore.ConsumeResult.Invalid)
    }

    @Test
    fun `acquireRequestSlot scopes redis key by clientIpBucket`() {
        val redisTemplate = mock(StringRedisTemplate::class.java)
        `when`(
            redisTemplate.execute(
                any<RedisScript<Long>>(),
                eq(listOf("auth:admin-email:request:recipient-hash:2001:db8:1:2::/64")),
                eq("5"),
                eq("600"),
            ),
        ).thenReturn(1L)
        val store = RedisAdminEmailChallengeStore(objectProvider(redisTemplate))

        val acquired =
            store.acquireRequestSlot(
                canonicalRecipientHash = "recipient-hash",
                maxRequests = 5,
                window = Duration.ofSeconds(600),
                clientIpBucket = "2001:db8:1:2::/64",
            )

        assertThat(acquired).isTrue()
    }

    private fun <T : Any> objectProvider(value: T?): ObjectProvider<T> =
        object : ObjectProvider<T> {
            override fun getObject(vararg args: Any?): T = value ?: error("No value")

            override fun getIfAvailable(): T? = value

            override fun getIfUnique(): T? = value

            override fun iterator(): MutableIterator<T> = listOfNotNull(value).toMutableList().iterator()

            override fun stream(): Stream<T> = listOfNotNull(value).stream()

            override fun orderedStream(): Stream<T> = stream()
        }
}
