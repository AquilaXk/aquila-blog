package com.back.boundedContexts.member.application.port.output

import java.time.Duration

interface AdminEmailChallengeStore {
    data class Challenge(
        val challengeId: String,
        val codeHash: String,
        val canonicalRecipientHash: String,
        val rememberMe: Boolean,
        val ttl: Duration,
    )

    sealed interface ConsumeResult {
        data class Matched(
            val canonicalRecipientHash: String,
            val rememberMe: Boolean,
        ) : ConsumeResult

        data object Invalid : ConsumeResult

        data object Exhausted : ConsumeResult
    }

    fun isAvailable(): Boolean

    fun issue(challenge: Challenge)

    fun consume(
        challengeId: String,
        submittedCodeHash: String,
        maxFailedAttempts: Int,
    ): ConsumeResult

    fun discard(challengeId: String)

    fun acquireRequestSlot(
        canonicalRecipientHash: String,
        maxRequests: Int,
        window: Duration,
    ): Boolean
}
