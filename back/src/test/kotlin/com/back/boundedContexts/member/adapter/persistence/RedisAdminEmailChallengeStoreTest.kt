package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.application.port.output.AdminEmailChallengeStore
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import java.util.stream.Stream

class RedisAdminEmailChallengeStoreTest {
    @Test
    fun `null Redis script result is an invalid challenge`() {
        val redisTemplate = mock(StringRedisTemplate::class.java)
        val store = RedisAdminEmailChallengeStore(objectProvider(redisTemplate))

        assertThat(store.consume("challenge", "hash", maxFailedAttempts = 5))
            .isEqualTo(AdminEmailChallengeStore.ConsumeResult.Invalid)
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
