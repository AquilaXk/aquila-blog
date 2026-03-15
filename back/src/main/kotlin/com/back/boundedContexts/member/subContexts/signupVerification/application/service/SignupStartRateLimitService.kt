package com.back.boundedContexts.member.subContexts.signupVerification.application.service

import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

@Service
class SignupStartRateLimitService(
    @param:Value("\${custom.member.signup.startRateLimit.maxAttemptsPerEmail:5}")
    private val maxAttemptsPerEmail: Int,
    @param:Value("\${custom.member.signup.startRateLimit.maxAttemptsPerIp:20}")
    private val maxAttemptsPerIp: Int,
    @param:Value("\${custom.member.signup.startRateLimit.windowSeconds:3600}")
    private val windowSeconds: Long,
    @param:Value("\${custom.member.signup.startRateLimit.memoryMaxEntries:10000}")
    private val memoryMaxEntries: Int,
    @param:Value("\${custom.member.signup.startRateLimit.memoryCleanupIntervalSeconds:60}")
    private val memoryCleanupIntervalSeconds: Long,
    private val redisTemplateProvider: ObjectProvider<StringRedisTemplate>,
) {
    private data class WindowState(
        var windowStartedAt: Long,
        var count: Int,
    )

    private val states = ConcurrentHashMap<String, WindowState>()
    private val lastCleanupEpochSeconds = AtomicLong(0)

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
            cleanupInMemoryState(Instant.now().epochSecond)
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

    private fun cleanupInMemoryState(nowEpochSeconds: Long) {
        val shouldForceCleanup = states.size > memoryMaxEntries
        val previousCleanupAt = lastCleanupEpochSeconds.get()
        val elapsed = nowEpochSeconds - previousCleanupAt

        if (!shouldForceCleanup && elapsed < memoryCleanupIntervalSeconds) return
        if (!lastCleanupEpochSeconds.compareAndSet(previousCleanupAt, nowEpochSeconds)) return

        states.entries.forEach { (stateKey, state) ->
            if (nowEpochSeconds - state.windowStartedAt >= windowSeconds) {
                states.remove(stateKey, state)
            }
        }

        val overflow = states.size - memoryMaxEntries
        if (overflow <= 0) return

        val keysToTrim =
            states.entries
                .asSequence()
                .sortedBy { it.value.windowStartedAt }
                .take(overflow)
                .map { it.key }
                .toList()

        keysToTrim.forEach(states::remove)
    }
}
