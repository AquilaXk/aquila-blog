package com.back.boundedContexts.member.subContexts.signupVerification.application.service

import com.back.global.app.application.AppFacade
import com.back.global.exception.application.AppException
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * SignupStartRateLimitService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
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
    @param:Value("\${custom.member.signup.startRateLimit.requireRedisInProd:true}")
    private val requireRedisInProd: Boolean,
    private val redisTemplateProvider: ObjectProvider<StringRedisTemplate>,
) {
    private data class WindowState(
        var windowStartedAt: Long,
        var count: Int,
    )

    private val states = ConcurrentHashMap<String, WindowState>()
    private val lastCleanupEpochSeconds = AtomicLong(0)

    /**
     * 검증 규칙을 적용해 허용 여부를 판정합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    fun checkAndConsume(
        email: String,
        clientIp: String,
    ): Boolean {
        val normalizedEmail = email.trim().lowercase()
        val normalizedIp = clientIp.trim().ifBlank { "unknown" }
        val redisTemplate = resolveRedisTemplate()

        return if (redisTemplate != null) {
            consumeInRedis(redisTemplate, "member:signup:start:email:$normalizedEmail", maxAttemptsPerEmail) &&
                consumeInRedis(redisTemplate, "member:signup:start:ip:$normalizedIp", maxAttemptsPerIp)
        } else {
            cleanupInMemoryState(Instant.now().epochSecond)
            consumeInMemory("email:$normalizedEmail", maxAttemptsPerEmail) &&
                consumeInMemory("ip:$normalizedIp", maxAttemptsPerIp)
        }
    }

    /**
     * 실행 시점에 필요한 의존성/값을 결정합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun resolveRedisTemplate(): StringRedisTemplate? {
        val redisTemplate = redisTemplateProvider.getIfAvailable()
        if (redisTemplate == null && AppFacade.isProd && requireRedisInProd) {
            throw AppException("503-3", "회원가입 보호 시스템이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.")
        }
        return redisTemplate
    }

    /**
     * consumeInMemory 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
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

    /**
     * consumeInRedis 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
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

    /**
     * 누적 상태를 정리해 메모리/스토리지 사용량을 관리합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
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
