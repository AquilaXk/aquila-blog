package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.application.port.output.AdminEmailChallengeStore
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.DefaultRedisScript
import org.springframework.stereotype.Component
import java.time.Duration

/**
 * 참조 구현: RFC 6585 & Redis ZSET sliding window rate limiting
 * 원자적 Lua 슬라이딩 윈도우 레이트리미터 및 챌린지 스토어.
 */
@Component
class RedisAdminEmailChallengeStore(
    private val redisTemplateProvider: ObjectProvider<StringRedisTemplate>,
) : AdminEmailChallengeStore {
    override fun isAvailable(): Boolean = redisTemplateProvider.getIfAvailable() != null

    override fun issue(challenge: AdminEmailChallengeStore.Challenge) {
        requireTemplate().execute(
            ISSUE_SCRIPT,
            listOf(challengeKey(challenge.challengeId)),
            challenge.codeHash,
            challenge.canonicalRecipientHash,
            challenge.rememberMe.toString(),
            challenge.ttl.seconds.toString(),
        )
    }

    override fun consume(
        challengeId: String,
        submittedCodeHash: String,
        maxFailedAttempts: Int,
    ): AdminEmailChallengeStore.ConsumeResult {
        val response =
            requireTemplate().execute(
                CONSUME_SCRIPT,
                listOf(challengeKey(challengeId)),
                submittedCodeHash,
                maxFailedAttempts.toString(),
            ) ?: return AdminEmailChallengeStore.ConsumeResult.Invalid

        return when {
            response == EXHAUSTED -> AdminEmailChallengeStore.ConsumeResult.Exhausted
            response.startsWith("$MATCHED|") -> response.toMatchedResult()
            else -> AdminEmailChallengeStore.ConsumeResult.Invalid
        }
    }

    override fun discard(challengeId: String) {
        requireTemplate().delete(challengeKey(challengeId))
    }

    override fun acquireRequestSlot(
        canonicalRecipientHash: String,
        maxRequests: Int,
        window: Duration,
        clientIpBucket: String,
        globalMaxRequests: Int,
    ): Boolean =
        requireTemplate().execute(
            REQUEST_SLOT_SCRIPT,
            listOf(
                requestSlotKey(canonicalRecipientHash, clientIpBucket),
                requestSlotKey(canonicalRecipientHash, DEFAULT_CLIENT_IP_BUCKET),
            ),
            maxRequests.toString(),
            window.seconds.toString(),
            globalMaxRequests.toString(),
        ) == 1L

    private fun requireTemplate(): StringRedisTemplate = redisTemplateProvider.getIfAvailable() ?: error("Redis template is unavailable")

    private fun String.toMatchedResult(): AdminEmailChallengeStore.ConsumeResult {
        val values = split('|')
        val canonicalRecipientHash = values.getOrNull(1)?.takeIf { it.isNotBlank() }
        val rememberMe = values.getOrNull(2)?.toBooleanStrictOrNull()
        return if (values.size == 3 && canonicalRecipientHash != null && rememberMe != null) {
            AdminEmailChallengeStore.ConsumeResult.Matched(canonicalRecipientHash, rememberMe)
        } else {
            AdminEmailChallengeStore.ConsumeResult.Invalid
        }
    }

    private fun challengeKey(challengeId: String) = "$CHALLENGE_KEY_PREFIX$challengeId"

    private fun requestSlotKey(
        canonicalRecipientHash: String,
        clientIpBucket: String,
    ): String {
        val normalizedBucket = clientIpBucket.trim().ifBlank { DEFAULT_CLIENT_IP_BUCKET }
        return "$REQUEST_SLOT_KEY_PREFIX$canonicalRecipientHash:$normalizedBucket"
    }

    private companion object {
        private const val CHALLENGE_KEY_PREFIX = "auth:admin-email:challenge:"
        private const val REQUEST_SLOT_KEY_PREFIX = "auth:admin-email:request:"
        private const val DEFAULT_CLIENT_IP_BUCKET = "global"
        private const val MATCHED = "matched"
        private const val EXHAUSTED = "exhausted"

        private val ISSUE_SCRIPT =
            DefaultRedisScript<Long>(
                """
                redis.call('HSET', KEYS[1], 'codeHash', ARGV[1], 'canonicalRecipientHash', ARGV[2], 'rememberMe', ARGV[3], 'failures', '0')
                redis.call('EXPIRE', KEYS[1], ARGV[4])
                return 1
                """.trimIndent(),
                Long::class.java,
            )
        private val CONSUME_SCRIPT =
            DefaultRedisScript<String>(
                """
                if redis.call('EXISTS', KEYS[1]) == 0 then return 'invalid' end
                if redis.call('HGET', KEYS[1], 'codeHash') == ARGV[1] then
                  local canonicalRecipientHash = redis.call('HGET', KEYS[1], 'canonicalRecipientHash')
                  local rememberMe = redis.call('HGET', KEYS[1], 'rememberMe')
                  if not canonicalRecipientHash or not rememberMe then
                    redis.call('DEL', KEYS[1])
                    return 'invalid'
                  end
                  redis.call('DEL', KEYS[1])
                  return 'matched|' .. canonicalRecipientHash .. '|' .. rememberMe
                end
                local failures = redis.call('HINCRBY', KEYS[1], 'failures', 1)
                if failures >= tonumber(ARGV[2]) then
                  redis.call('DEL', KEYS[1])
                  return 'exhausted'
                end
                return 'invalid'
                """.trimIndent(),
                String::class.java,
            )
        private val REQUEST_SLOT_SCRIPT =
            DefaultRedisScript<Long>(
                """
                local time = redis.call('TIME')
                local now_sec = tonumber(time[1])
                local now_micro = tonumber(time[2])
                local now_ms = now_sec * 1000 + math.floor(now_micro / 1000)
                local window_sec = tonumber(ARGV[2])
                local clear_before = now_ms - (window_sec * 1000)

                local ip_limit = tonumber(ARGV[1])
                redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', clear_before)
                local ip_count = redis.call('ZCARD', KEYS[1])
                if ip_count >= ip_limit then return 0 end

                local global_limit = tonumber(ARGV[3])
                local same_key = (KEYS[1] == KEYS[2])
                local global_count = 0
                if not same_key then
                  redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', clear_before)
                  global_count = redis.call('ZCARD', KEYS[2])
                  if global_count >= global_limit then return 0 end
                end

                local prefix = tostring(now_ms) .. ':' .. tostring(now_micro) .. ':'
                redis.call('ZADD', KEYS[1], now_ms, prefix .. tostring(ip_count))
                redis.call('EXPIRE', KEYS[1], window_sec)

                if not same_key then
                  redis.call('ZADD', KEYS[2], now_ms, prefix .. tostring(global_count))
                  redis.call('EXPIRE', KEYS[2], window_sec)
                end

                return 1
                """.trimIndent(),
                Long::class.java,
            )
    }
}
