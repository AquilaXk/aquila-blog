package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.LoginAttemptPolicyUseCase
import com.back.global.app.application.AppFacade
import com.back.global.cache.application.port.output.RedisKeyValuePort
import com.back.global.exception.application.AppException
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * LoginAttemptService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class LoginAttemptService(
    @param:Value("\${custom.auth.login.maxAttempts:5}")
    private val maxAttempts: Int,
    @param:Value("\${custom.auth.login.windowSeconds:300}")
    private val windowSeconds: Long,
    @param:Value("\${custom.auth.login.lockSeconds:600}")
    private val lockSeconds: Long,
    @param:Value("\${custom.auth.login.memoryMaxEntries:10000}")
    private val memoryMaxEntries: Int,
    @param:Value("\${custom.auth.login.memoryCleanupIntervalSeconds:60}")
    private val memoryCleanupIntervalSeconds: Long,
    @param:Value("\${custom.auth.login.requireRedisInProd:true}")
    private val requireRedisInProd: Boolean,
    private val redisKeyValuePort: RedisKeyValuePort,
) : LoginAttemptPolicyUseCase {
    private data class LoginAttemptState(
        var windowStartedAt: Long,
        var failureCount: Int,
        var blockedUntil: Long,
    )

    private val states = ConcurrentHashMap<String, LoginAttemptState>()
    private val lastCleanupEpochSeconds = AtomicLong(0)

    /**
     * 검증 규칙을 적용해 허용 여부를 판정합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    override fun isBlocked(
        username: String,
        clientIp: String,
    ): Boolean {
        val key = key(username, clientIp)
        if (resolveRedisAvailability()) {
            return isBlockedInRedis(key)
        }

        val now = nowEpochSeconds()
        cleanupInMemoryState(now)
        val state = states[key] ?: return false

        if (state.blockedUntil > now) return true

        // 차단이 해제되고 윈도우도 만료되면 상태를 정리한다.
        if (now - state.windowStartedAt >= windowSeconds) {
            states.remove(key, state)
        }

        return false
    }

    /**
     * 상태 기록을 남기고 제한 정책 계산에 반영합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    override fun recordFailure(
        username: String,
        clientIp: String,
    ): Boolean {
        val key = key(username, clientIp)
        if (resolveRedisAvailability()) {
            return recordFailureInRedis(key)
        }

        val now = nowEpochSeconds()
        cleanupInMemoryState(now)
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

    /**
     * clear 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    override fun clear(
        username: String,
        clientIp: String,
    ) {
        val key = key(username, clientIp)
        if (resolveRedisAvailability()) {
            redisKeyValuePort.delete(listOf(redisFailureKey(key), redisBlockedKey(key)))
            return
        }

        states.remove(key)
    }

    fun clearAllForTest() {
        states.clear()
        if (redisKeyValuePort.isAvailable()) {
            val keys = redisKeyValuePort.keys("auth:login:*")
            if (keys.isNotEmpty()) redisKeyValuePort.delete(keys)
        }
    }

    /**
     * key 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun key(
        username: String,
        clientIp: String,
    ): String = "${username.trim().lowercase()}|${clientIp.trim()}"

    /**
     * 검증 규칙을 적용해 허용 여부를 판정합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun isBlockedInRedis(key: String): Boolean {
        val blockedUntil = redisKeyValuePort.get(redisBlockedKey(key))?.toLongOrNull() ?: return false

        return blockedUntil > nowEpochSeconds()
    }

    /**
     * 상태 기록을 남기고 제한 정책 계산에 반영합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun recordFailureInRedis(key: String): Boolean {
        if (isBlockedInRedis(key)) return true

        val failureKey = redisFailureKey(key)
        val blockedKey = redisBlockedKey(key)
        val failures = redisKeyValuePort.increment(failureKey) ?: 0L

        if (failures == 1L) {
            redisKeyValuePort.expire(failureKey, Duration.ofSeconds(windowSeconds))
        }

        if (failures >= maxAttempts.toLong()) {
            val blockedUntil = nowEpochSeconds() + lockSeconds
            redisKeyValuePort.set(blockedKey, blockedUntil.toString(), Duration.ofSeconds(lockSeconds))
            redisKeyValuePort.delete(listOf(failureKey))
            return true
        }

        return false
    }

    private fun redisFailureKey(key: String): String = "auth:login:fail:$key"

    private fun redisBlockedKey(key: String): String = "auth:login:blocked:$key"

    /**
     * 실행 시점에 필요한 의존성/값을 결정합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun resolveRedisAvailability(): Boolean {
        val isRedisAvailable = redisKeyValuePort.isAvailable()
        if (!isRedisAvailable && AppFacade.isProd && requireRedisInProd) {
            throw AppException("503-2", "로그인 보호 시스템이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.")
        }
        return isRedisAvailable
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
            if (state.blockedUntil <= nowEpochSeconds && nowEpochSeconds - state.windowStartedAt >= windowSeconds) {
                states.remove(stateKey, state)
            }
        }

        val overflow = states.size - memoryMaxEntries
        if (overflow <= 0) return

        val keysToTrim =
            states.entries
                .asSequence()
                .sortedBy { (_, state) ->
                    if (state.blockedUntil > nowEpochSeconds) state.blockedUntil else state.windowStartedAt
                }.take(overflow)
                .map { it.key }
                .toList()

        keysToTrim.forEach(states::remove)
    }

    private fun nowEpochSeconds(): Long = Instant.now().epochSecond
}
