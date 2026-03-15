package com.back.boundedContexts.post.application.service

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

@Service
class PostHitDedupService(
    @param:Value("\${custom.post.hit.viewerWindowSeconds:86400}")
    private val viewerWindowSeconds: Long,
    @param:Value("\${custom.post.hit.memoryMaxEntries:50000}")
    private val memoryMaxEntries: Int,
    @param:Value("\${custom.post.hit.memoryCleanupIntervalSeconds:60}")
    private val memoryCleanupIntervalSeconds: Long,
    private val redisTemplateProvider: ObjectProvider<StringRedisTemplate>,
) {
    private val logger = LoggerFactory.getLogger(PostHitDedupService::class.java)
    private val memoryState = ConcurrentHashMap<String, Long>()
    private val lastCleanupEpochSeconds = AtomicLong(0)
    private val redisKeyPrefix = "post:hit:viewed:"

    fun shouldCountHit(
        postId: Int,
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
                logger.warn("Falling back to in-memory post hit dedupe because Redis is unavailable", exception)
            } catch (exception: RuntimeException) {
                logger.warn("Falling back to in-memory post hit dedupe because Redis access failed", exception)
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

    private fun sha256(value: String): String =
        MessageDigest
            .getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
