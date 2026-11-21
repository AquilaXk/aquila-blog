package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.PostHitDedupUseCase
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
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
    @param:Value("\${custom.post.like.viewerWindowSeconds:31536000}")
    private val likeViewerWindowSeconds: Long = 31_536_000L,
) : PostHitDedupUseCase {
    private val redisKeyPrefix = "post:hit:viewed:"
    private val likeRedisKeyPrefix = "post:like:liked:"

    override fun shouldCountHit(
        postId: Long,
        viewerKey: String,
    ): Boolean =
        executeViewerDedup(postId, viewerKey, onBlank = false) { redisTemplate, normalizedKey ->
            redisTemplate
                .opsForValue()
                .setIfAbsent(redisKey(normalizedKey), "1", Duration.ofSeconds(viewerWindowSeconds)) == true
        }

    override fun markLikedIfAbsent(
        postId: Long,
        viewerKey: String,
    ): Boolean =
        executeViewerDedup(postId, viewerKey, onBlank = false) { redisTemplate, normalizedKey ->
            redisTemplate
                .opsForValue()
                .setIfAbsent(likeRedisKey(normalizedKey), "1", Duration.ofSeconds(likeViewerWindowSeconds)) == true
        }

    override fun unmarkLikedIfPresent(
        postId: Long,
        viewerKey: String,
    ): Boolean =
        executeViewerDedup(postId, viewerKey, onBlank = false) { redisTemplate, normalizedKey ->
            redisTemplate.delete(likeRedisKey(normalizedKey)) == true
        }

    private fun executeViewerDedup(
        postId: Long,
        viewerKey: String,
        onBlank: Boolean,
        block: (StringRedisTemplate, String) -> Boolean,
    ): Boolean {
        val safeViewerKey = viewerKey.trim()
        if (safeViewerKey.isBlank()) return onBlank

        val normalizedKey = "$postId:${sha256Hex(safeViewerKey)}"
        val redisTemplate = redisTemplateProvider.getIfAvailable() ?: throw serviceUnavailable()

        return try {
            block(redisTemplate, normalizedKey)
        } catch (exception: RuntimeException) {
            throw serviceUnavailable(exception)
        }
    }

    private fun redisKey(value: String): String = "$redisKeyPrefix$value"

    private fun likeRedisKey(value: String): String = "$likeRedisKeyPrefix$value"

    private fun serviceUnavailable(cause: Throwable? = null): AppException =
        AppException(
            ErrorCode.SERVICE_UNAVAILABLE,
            cause = cause,
        )

    companion object {
        private val SHA_256_DIGEST =
            ThreadLocal.withInitial {
                MessageDigest.getInstance("SHA-256")
            }

        private val HEX_CHARS = "0123456789abcdef".toCharArray()

        internal fun sha256Hex(value: String): String {
            val md = SHA_256_DIGEST.get()
            md.reset()
            val bytes = value.toByteArray(StandardCharsets.UTF_8)
            val digest = md.digest(bytes)
            val hex = CharArray(64)
            for (i in 0 until 32) {
                val b = digest[i].toInt() and 0xFF
                hex[i * 2] = HEX_CHARS[b ushr 4]
                hex[i * 2 + 1] = HEX_CHARS[b and 0x0F]
            }
            return String(hex)
        }
    }
}
