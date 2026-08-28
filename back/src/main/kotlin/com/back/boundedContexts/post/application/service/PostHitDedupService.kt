package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.PostHitDedupUseCase
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.dao.DataAccessException
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Duration

@Service
class PostHitDedupService(
    @param:Value("\${custom.post.hit.viewerWindowSeconds:86400}")
    private val viewerWindowSeconds: Long,
    private val redisTemplateProvider: ObjectProvider<StringRedisTemplate>,
) : PostHitDedupUseCase {
    private val redisKeyPrefix = "post:hit:viewed:"

    override fun shouldCountHit(
        postId: Long,
        viewerKey: String,
    ): Boolean {
        val safeViewerKey = viewerKey.trim()
        if (safeViewerKey.isBlank()) return true

        val normalizedKey = "$postId:${sha256(safeViewerKey)}"
        val redisTemplate = redisTemplateProvider.getIfAvailable() ?: throw serviceUnavailable()

        val counted =
            try {
                redisTemplate
                    .opsForValue()
                    .setIfAbsent(redisKey(normalizedKey), "1", Duration.ofSeconds(viewerWindowSeconds))
            } catch (exception: DataAccessException) {
                throw serviceUnavailable(exception)
            } catch (exception: RuntimeException) {
                throw serviceUnavailable(exception)
            }

        return counted ?: throw serviceUnavailable()
    }

    fun clearAllForTest() {
        redisTemplateProvider.getIfAvailable()?.let { redisTemplate ->
            val keys = redisTemplate.keys("$redisKeyPrefix*")
            if (!keys.isNullOrEmpty()) redisTemplate.delete(keys)
        }
    }

    private fun redisKey(value: String): String = "$redisKeyPrefix$value"

    private fun serviceUnavailable(cause: Throwable? = null): AppException =
        AppException(
            ErrorCode.SERVICE_UNAVAILABLE,
            cause = cause,
        )

    private fun sha256(value: String): String =
        MessageDigest
            .getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
