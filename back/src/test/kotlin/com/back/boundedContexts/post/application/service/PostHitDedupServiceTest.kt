package com.back.boundedContexts.post.application.service

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.springframework.beans.factory.ObjectProvider
import org.springframework.dao.DataAccessResourceFailureException
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.ValueOperations
import java.time.Duration
import java.util.stream.Stream

class PostHitDedupServiceTest {
    private val redisTemplate = mock(StringRedisTemplate::class.java)

    @Test
    fun `redis provider가 없으면 hit dedupe를 service unavailable로 거부한다`() {
        val service = service(redisTemplate = null)

        assertServiceUnavailable { service.shouldCountHit(postId = 1L, viewerKey = "viewer") }
    }

    @Test
    fun `redis SETNX가 data access exception을 던지면 hit dedupe를 service unavailable로 거부한다`() {
        val valueOperations = valueOperations()
        given(redisTemplate.opsForValue()).willReturn(valueOperations)
        given(valueOperations.setIfAbsent(anyString(), anyString(), any(Duration::class.java)))
            .willThrow(DataAccessResourceFailureException("Redis unavailable"))
        val service = service(redisTemplate)

        assertServiceUnavailable { service.shouldCountHit(postId = 1L, viewerKey = "viewer") }
    }

    @Test
    fun `redis SETNX가 true면 hit을 count한다`() {
        val valueOperations = valueOperations()
        given(redisTemplate.opsForValue()).willReturn(valueOperations)
        given(valueOperations.setIfAbsent(anyString(), anyString(), any(Duration::class.java))).willReturn(true)
        val service = service(redisTemplate)

        assertThat(service.shouldCountHit(postId = 1L, viewerKey = "viewer")).isTrue()
    }

    @Test
    fun `redis SETNX가 false면 hit을 count하지 않는다`() {
        val valueOperations = valueOperations()
        given(redisTemplate.opsForValue()).willReturn(valueOperations)
        given(valueOperations.setIfAbsent(anyString(), anyString(), any(Duration::class.java))).willReturn(false)
        val service = service(redisTemplate)

        assertThat(service.shouldCountHit(postId = 1L, viewerKey = "viewer")).isFalse()
    }

    @Test
    fun `redis provider가 없으면 like dedupe와 unlike dedupe를 service unavailable로 거부한다`() {
        val service = service(redisTemplate = null)

        assertServiceUnavailable { service.markLikedIfAbsent(postId = 1L, viewerKey = "viewer") }
        assertServiceUnavailable { service.unmarkLikedIfPresent(postId = 1L, viewerKey = "viewer") }
    }

    @Test
    fun `redis가 예외를 던지면 like dedupe와 unlike dedupe를 service unavailable로 거부한다`() {
        val valueOperations = valueOperations()
        given(redisTemplate.opsForValue()).willReturn(valueOperations)
        given(valueOperations.setIfAbsent(anyString(), anyString(), any(Duration::class.java)))
            .willThrow(DataAccessResourceFailureException("Redis unavailable"))
        given(redisTemplate.delete(anyString()))
            .willThrow(DataAccessResourceFailureException("Redis unavailable"))
        val service = service(redisTemplate)

        assertServiceUnavailable { service.markLikedIfAbsent(postId = 1L, viewerKey = "viewer") }
        assertServiceUnavailable { service.unmarkLikedIfPresent(postId = 1L, viewerKey = "viewer") }
    }

    @Test
    fun `markLikedIfAbsent는 SETNX 결과에 따라 true와 false를 반환한다`() {
        val valueOperations = valueOperations()
        given(redisTemplate.opsForValue()).willReturn(valueOperations)
        val expectedKey = "post:like:liked:1:d35ca5051b82ffc326a3b0b6574a9a3161dee16b9478a199ee39cd803ce5b799"
        given(
            valueOperations.setIfAbsent(
                expectedKey,
                "1",
                Duration.ofSeconds(31_536_000L),
            ),
        ).willReturn(true, false)
        val service = service(redisTemplate)

        assertThat(service.markLikedIfAbsent(postId = 1L, viewerKey = "viewer")).isTrue()
        assertThat(service.markLikedIfAbsent(postId = 1L, viewerKey = "viewer")).isFalse()
        assertThat(service.markLikedIfAbsent(postId = 1L, viewerKey = "   ")).isFalse()
    }

    @Test
    fun `unmarkLikedIfPresent는 DEL 결과에 따라 true와 false를 반환한다`() {
        val expectedKey = "post:like:liked:1:d35ca5051b82ffc326a3b0b6574a9a3161dee16b9478a199ee39cd803ce5b799"
        given(redisTemplate.delete(expectedKey)).willReturn(true, false)
        val service = service(redisTemplate)

        assertThat(service.unmarkLikedIfPresent(postId = 1L, viewerKey = "viewer")).isTrue()
        assertThat(service.unmarkLikedIfPresent(postId = 1L, viewerKey = "viewer")).isFalse()
        assertThat(service.unmarkLikedIfPresent(postId = 1L, viewerKey = "   ")).isFalse()
    }

    private fun service(redisTemplate: StringRedisTemplate?): PostHitDedupService =
        PostHitDedupService(
            viewerWindowSeconds = 60,
            redisTemplateProvider = objectProvider(redisTemplate),
        )

    @Suppress("UNCHECKED_CAST")
    private fun valueOperations(): ValueOperations<String, String> = mock(ValueOperations::class.java) as ValueOperations<String, String>

    private fun assertServiceUnavailable(block: () -> Unit) {
        assertThatThrownBy(block)
            .isInstanceOf(AppException::class.java)
            .extracting("errorCode")
            .isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)
    }

    private fun objectProvider(redisTemplate: StringRedisTemplate?): ObjectProvider<StringRedisTemplate> =
        object : ObjectProvider<StringRedisTemplate> {
            override fun getObject(vararg args: Any?): StringRedisTemplate = redisTemplate ?: error("No redis template")

            override fun getIfAvailable(): StringRedisTemplate? = redisTemplate

            override fun getIfUnique(): StringRedisTemplate? = redisTemplate

            override fun iterator(): MutableIterator<StringRedisTemplate> = listOfNotNull(redisTemplate).toMutableList().iterator()

            override fun stream(): Stream<StringRedisTemplate> = listOfNotNull(redisTemplate).stream()

            override fun orderedStream(): Stream<StringRedisTemplate> = stream()
        }
}
