package com.back.boundedContexts.member.application.service

import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

@Service
class LoginAttemptService(
    @param:Value("\${custom.auth.login.maxAttempts:5}")
    private val maxAttempts: Int,
    @param:Value("\${custom.auth.login.windowSeconds:300}")
    private val windowSeconds: Long,
    @param:Value("\${custom.auth.login.lockSeconds:600}")
    private val lockSeconds: Long,
    private val redisTemplateProvider: ObjectProvider<StringRedisTemplate>,
) {
    private data class LoginAttemptState(
        var windowStartedAt: Long,
        var failureCount: Int,
        var blockedUntil: Long,
    )

    private val states = ConcurrentHashMap<String, LoginAttemptState>()

    fun isBlocked(
        username: String,
        clientIp: String,
    ): Boolean {
        val key = key(username, clientIp)
        val redisTemplate = redisTemplateProvider.getIfAvailable()

        if (redisTemplate != null) {
            return isBlockedInRedis(redisTemplate, key)
        }

        val now = nowEpochSeconds()
        val state = states[key] ?: return false

        if (state.blockedUntil > now) return true

        // 차단이 해제되고 윈도우도 만료되면 상태를 정리한다.
        if (now - state.windowStartedAt >= windowSeconds) {
            states.remove(key, state)
        }

        return false
    }

    fun recordFailure(
        username: String,
        clientIp: String,
    ): Boolean {
        val key = key(username, clientIp)
        val redisTemplate = redisTemplateProvider.getIfAvailable()

        if (redisTemplate != null) {
            return recordFailureInRedis(redisTemplate, key)
        }

        val now = nowEpochSeconds()
        val nextState =
            states.compute(key) { _, current ->
                val state =
                    current
                        ?.takeIf { now - it.windowStartedAt < windowSeconds || it.blockedUntil > now }
                        ?: LoginAttemptState(
                            windowStartedAt = now,
                            failureCount = 0,
                            blockedUntil = 0,
                        )

                if (state.blockedUntil <= now) {
                    state.failureCount += 1
                    if (state.failureCount >= maxAttempts) {
                        state.blockedUntil = now + lockSeconds
                        state.failureCount = 0
                        state.windowStartedAt = now
                    }
                }

                state
            } ?: return false

        return nextState.blockedUntil > now
    }

    fun clear(
        username: String,
        clientIp: String,
    ) {
        val key = key(username, clientIp)
        val redisTemplate = redisTemplateProvider.getIfAvailable()

        if (redisTemplate != null) {
            redisTemplate.delete(listOf(redisFailureKey(key), redisBlockedKey(key)))
            return
        }

        states.remove(key)
    }

    fun clearAllForTest() {
        states.clear()
        redisTemplateProvider.getIfAvailable()?.let { redisTemplate ->
            val keys = redisTemplate.keys("auth:login:*")
            if (!keys.isNullOrEmpty()) redisTemplate.delete(keys)
        }
    }

    private fun key(
        username: String,
        clientIp: String,
    ): String = "${username.trim().lowercase()}|${clientIp.trim()}"

    private fun isBlockedInRedis(
        redisTemplate: StringRedisTemplate,
        key: String,
    ): Boolean {
        val blockedUntil =
            redisTemplate
                .opsForValue()
                .get(redisBlockedKey(key))
                ?.toLongOrNull()
                ?: return false

        return blockedUntil > nowEpochSeconds()
    }

    private fun recordFailureInRedis(
        redisTemplate: StringRedisTemplate,
        key: String,
    ): Boolean {
        if (isBlockedInRedis(redisTemplate, key)) return true

        val failureKey = redisFailureKey(key)
        val blockedKey = redisBlockedKey(key)
        val ops = redisTemplate.opsForValue()
        val failures = ops.increment(failureKey) ?: 0L

        if (failures == 1L) {
            redisTemplate.expire(failureKey, Duration.ofSeconds(windowSeconds))
        }

        if (failures >= maxAttempts.toLong()) {
            val blockedUntil = nowEpochSeconds() + lockSeconds
            ops.set(blockedKey, blockedUntil.toString(), Duration.ofSeconds(lockSeconds))
            redisTemplate.delete(failureKey)
            return true
        }

        return false
    }

    private fun redisFailureKey(key: String): String = "auth:login:fail:$key"

    private fun redisBlockedKey(key: String): String = "auth:login:blocked:$key"

    private fun nowEpochSeconds(): Long = Instant.now().epochSecond
}
