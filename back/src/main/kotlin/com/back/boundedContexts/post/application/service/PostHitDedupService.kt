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
import java.util.HexFormat

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
    ): Boolean {
        val safeViewerKey = viewerKey.trim()
        if (safeViewerKey.isBlank()) return true

        val normalizedKey = "$postId:${sha256(safeViewerKey)}"
        val redisTemplate = redisTemplateProvider.getIfAvailable() ?: throw serviceUnavailable()

        return try {
            redisTemplate
                .opsForValue()
                .setIfAbsent(redisKey(normalizedKey), "1", Duration.ofSeconds(viewerWindowSeconds))
        } catch (exception: DataAccessException) {
            throw serviceUnavailable(exception)
        } catch (exception: RuntimeException) {
            throw serviceUnavailable(exception)
        }
    }

    override fun markLikedIfAbsent(
        postId: Long,
        viewerKey: String,
    ): Boolean {
        val safeViewerKey = viewerKey.trim()
        if (safeViewerKey.isBlank()) return false

        val normalizedKey = "$postId:${sha256(safeViewerKey)}"
        val redisTemplate = redisTemplateProvider.getIfAvailable() ?: throw serviceUnavailable()

        return try {
            redisTemplate
                .opsForValue()
                .setIfAbsent(likeRedisKey(normalizedKey), "1", Duration.ofSeconds(likeViewerWindowSeconds)) == true
        } catch (exception: DataAccessException) {
            throw serviceUnavailable(exception)
        } catch (exception: RuntimeException) {
            throw serviceUnavailable(exception)
        }
    }

    override fun unmarkLikedIfPresent(
        postId: Long,
        viewerKey: String,
    ): Boolean {
        val safeViewerKey = viewerKey.trim()
        if (safeViewerKey.isBlank()) return false

        val normalizedKey = "$postId:${sha256(safeViewerKey)}"
        val redisTemplate = redisTemplateProvider.getIfAvailable() ?: throw serviceUnavailable()

        return try {
            redisTemplate.delete(likeRedisKey(normalizedKey)) == true
        } catch (exception: DataAccessException) {
            throw serviceUnavailable(exception)
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

    private fun sha256(value: String): String =
        HexFormat.of().formatHex(
            MessageDigest
                .getInstance("SHA-256")
                .digest(value.toByteArray(StandardCharsets.UTF_8)),
        )
}
