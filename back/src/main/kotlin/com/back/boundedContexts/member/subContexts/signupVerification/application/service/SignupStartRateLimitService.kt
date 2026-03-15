package com.back.boundedContexts.member.subContexts.signupVerification.application.service

import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

@Service
class SignupStartRateLimitService(
    @param:Value("\${custom.member.signup.startRateLimit.maxAttemptsPerEmail:5}")
    private val maxAttemptsPerEmail: Int,
    @param:Value("\${custom.member.signup.startRateLimit.maxAttemptsPerIp:20}")
    private val maxAttemptsPerIp: Int,
    @param:Value("\${custom.member.signup.startRateLimit.windowSeconds:3600}")
    private val windowSeconds: Long,
    private val redisTemplateProvider: ObjectProvider<StringRedisTemplate>,
) {
    private data class WindowState(
        var windowStartedAt: Long,
        var count: Int,
    )

    private val states = ConcurrentHashMap<String, WindowState>()

    fun checkAndConsume(
        email: String,
        clientIp: String,
    ): Boolean {
        val normalizedEmail = email.trim().lowercase()
        val normalizedIp = clientIp.trim().ifBlank { "unknown" }
        val redisTemplate = redisTemplateProvider.getIfAvailable()

        return if (redisTemplate != null) {
            consumeInRedis(redisTemplate, "member:signup:start:email:$normalizedEmail", maxAttemptsPerEmail) &&
                consumeInRedis(redisTemplate, "member:signup:start:ip:$normalizedIp", maxAttemptsPerIp)
        } else {
            consumeInMemory("email:$normalizedEmail", maxAttemptsPerEmail) &&
                consumeInMemory("ip:$normalizedIp", maxAttemptsPerIp)
        }
    }

    private fun consumeInMemory(
        key: String,
        maxAttempts: Int,
    ): Boolean {
        val now = Instant.now().epochSecond
        val next =
            states.compute(key) { _, current ->
                val state =
                    current?.takeIf { now - it.windowStartedAt < windowSeconds }
                        ?: WindowState(windowStartedAt = now, count = 0)
                state.count += 1
                state
            } ?: return false

        return next.count <= maxAttempts
    }

    private fun consumeInRedis(
        redisTemplate: StringRedisTemplate,
        key: String,
        maxAttempts: Int,
    ): Boolean {
        val ops = redisTemplate.opsForValue()
        val nextCount = ops.increment(key) ?: 0L
        if (nextCount == 1L) {
            redisTemplate.expire(key, Duration.ofSeconds(windowSeconds))
        }
        return nextCount <= maxAttempts.toLong()
    }
}
