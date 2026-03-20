package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.PostHitDedupUseCase
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.dao.DataAccessException
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * PostHitDedupService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class PostHitDedupService(
    @param:Value("\${custom.post.hit.viewerWindowSeconds:86400}")
    private val viewerWindowSeconds: Long,
    @param:Value("\${custom.post.hit.memoryMaxEntries:50000}")
    private val memoryMaxEntries: Int,
    @param:Value("\${custom.post.hit.memoryCleanupIntervalSeconds:60}")
    private val memoryCleanupIntervalSeconds: Long,
    @param:Value("\${custom.post.hit.redisWarnIntervalSeconds:300}")
    private val redisWarnIntervalSeconds: Long,
    private val redisTemplateProvider: ObjectProvider<StringRedisTemplate>,
) : PostHitDedupUseCase {
    private val logger = LoggerFactory.getLogger(PostHitDedupService::class.java)
    private val memoryState = ConcurrentHashMap<String, Long>()
    private val lastCleanupEpochSeconds = AtomicLong(0)
    private val lastRedisWarnEpochSeconds = AtomicLong(0)
    private val suppressedRedisFallbackWarnCount = AtomicLong(0)
    private val redisKeyPrefix = "post:hit:viewed:"

    /**
     * shouldCountHit 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    override fun shouldCountHit(
        postId: Long,
        viewerKey: String,
    ): Boolean {
        val safeViewerKey = viewerKey.trim()
        if (safeViewerKey.isBlank()) return true

        val normalizedKey = "$postId:${sha256(safeViewerKey)}"
        val redisTemplate = redisTemplateProvider.getIfAvailable()

        if (redisTemplate != null) {
            try {
                return redisTemplate
                    .opsForValue()
                    .setIfAbsent(redisKey(normalizedKey), "1", Duration.ofSeconds(viewerWindowSeconds)) == true
            } catch (exception: DataAccessException) {
                warnRedisFallback(exception)
            } catch (exception: RuntimeException) {
                warnRedisFallback(exception)
            }
        }

        val now = Instant.now().epochSecond
        cleanupInMemoryState(now)
        val expiresAt = now + viewerWindowSeconds

        while (true) {
            val current = memoryState[normalizedKey]
            if (current == null) {
                if (memoryState.putIfAbsent(normalizedKey, expiresAt) == null) return true
                continue
            }

            if (current > now) return false
            if (memoryState.replace(normalizedKey, current, expiresAt)) return true
        }
    }

    fun clearAllForTest() {
        memoryState.clear()
        redisTemplateProvider.getIfAvailable()?.let { redisTemplate ->
            val keys = redisTemplate.keys("$redisKeyPrefix*")
            if (!keys.isNullOrEmpty()) redisTemplate.delete(keys)
        }
    }

    private fun redisKey(value: String): String = "$redisKeyPrefix$value"

    /**
     * 누적 상태를 정리해 메모리/스토리지 사용량을 관리합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun cleanupInMemoryState(nowEpochSeconds: Long) {
        val shouldForceCleanup = memoryState.size > memoryMaxEntries
        val previousCleanupAt = lastCleanupEpochSeconds.get()
        val elapsed = nowEpochSeconds - previousCleanupAt

        if (!shouldForceCleanup && elapsed < memoryCleanupIntervalSeconds) return
        if (!lastCleanupEpochSeconds.compareAndSet(previousCleanupAt, nowEpochSeconds)) return

        memoryState.entries.forEach { (stateKey, expiresAt) ->
            if (expiresAt <= nowEpochSeconds) {
                memoryState.remove(stateKey, expiresAt)
            }
        }

        val overflow = memoryState.size - memoryMaxEntries
        if (overflow <= 0) return

        val keysToTrim =
            memoryState.entries
                .asSequence()
                .sortedBy { it.value }
                .take(overflow)
                .map { it.key }
                .toList()

        keysToTrim.forEach(memoryState::remove)
    }

    /**
     * warnRedisFallback 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun warnRedisFallback(exception: Exception) {
        val nowEpochSeconds = Instant.now().epochSecond
        val warnInterval = redisWarnIntervalSeconds.coerceAtLeast(1)
        val previousWarnAt = lastRedisWarnEpochSeconds.get()
        if (nowEpochSeconds - previousWarnAt < warnInterval || !lastRedisWarnEpochSeconds.compareAndSet(previousWarnAt, nowEpochSeconds)) {
            suppressedRedisFallbackWarnCount.incrementAndGet()
            return
        }

        val suppressedCount = suppressedRedisFallbackWarnCount.getAndSet(0)
        logger.warn(
            "Falling back to in-memory post hit dedupe because Redis access failed. suppressed={} cause={}",
            suppressedCount,
            exception.message,
        )
        logger.debug("Redis fallback stacktrace", exception)
    }

    private fun sha256(value: String): String =
        MessageDigest
            .getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
