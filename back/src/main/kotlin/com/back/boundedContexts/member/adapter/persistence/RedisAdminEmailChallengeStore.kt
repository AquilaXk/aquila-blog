package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.application.port.output.AdminEmailChallengeStore
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.DefaultRedisScript
import org.springframework.stereotype.Component
import java.time.Duration

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
            challenge.memberId.toString(),
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
    ): Boolean =
        requireTemplate().execute(
            REQUEST_SLOT_SCRIPT,
            listOf(requestSlotKey(canonicalRecipientHash)),
            maxRequests.toString(),
            window.seconds.toString(),
        ) == 1L

    private fun requireTemplate(): StringRedisTemplate = redisTemplateProvider.getIfAvailable() ?: error("Redis template is unavailable")

    private fun String.toMatchedResult(): AdminEmailChallengeStore.ConsumeResult {
        val values = split('|')
        val memberId = values.getOrNull(1)?.toLongOrNull()
        val rememberMe = values.getOrNull(2)?.toBooleanStrictOrNull()
        return if (values.size == 3 && memberId != null && rememberMe != null) {
            AdminEmailChallengeStore.ConsumeResult.Matched(memberId, rememberMe)
        } else {
            AdminEmailChallengeStore.ConsumeResult.Invalid
        }
    }

    private fun challengeKey(challengeId: String) = "$CHALLENGE_KEY_PREFIX$challengeId"

    private fun requestSlotKey(canonicalRecipientHash: String) = "$REQUEST_SLOT_KEY_PREFIX$canonicalRecipientHash"

    private companion object {
        private const val CHALLENGE_KEY_PREFIX = "auth:admin-email:challenge:"
        private const val REQUEST_SLOT_KEY_PREFIX = "auth:admin-email:request:"
        private const val MATCHED = "matched"
        private const val EXHAUSTED = "exhausted"

        private val ISSUE_SCRIPT =
            DefaultRedisScript<Long>(
                """
                redis.call('HSET', KEYS[1], 'codeHash', ARGV[1], 'memberId', ARGV[2], 'rememberMe', ARGV[3], 'failures', '0')
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
                  local memberId = redis.call('HGET', KEYS[1], 'memberId')
                  local rememberMe = redis.call('HGET', KEYS[1], 'rememberMe')
                  if not memberId or not rememberMe then
                    redis.call('DEL', KEYS[1])
                    return 'invalid'
                  end
                  redis.call('DEL', KEYS[1])
                  return 'matched|' .. memberId .. '|' .. rememberMe
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
                local requests = tonumber(redis.call('GET', KEYS[1]) or '0')
                if requests >= tonumber(ARGV[1]) then return 0 end
                requests = redis.call('INCR', KEYS[1])
                if requests == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
                return 1
                """.trimIndent(),
                Long::class.java,
            )
    }
}
