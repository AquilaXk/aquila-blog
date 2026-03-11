package com.back.boundedContexts.member.application.service

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

@Service
class LoginAttemptService(
    @param:Value("\${custom.auth.login.maxAttempts:5}")
    private val maxAttempts: Int,
    @param:Value("\${custom.auth.login.windowSeconds:300}")
    private val windowSeconds: Long,
    @param:Value("\${custom.auth.login.lockSeconds:600}")
    private val lockSeconds: Long,
) {
    private data class LoginAttemptState(
        var windowStartedAt: Long,
        var failureCount: Int,
        var blockedUntil: Long,
    )

    private val states = ConcurrentHashMap<String, LoginAttemptState>()

    fun isBlocked(
        username: String,
        clientIp: String,
    ): Boolean {
        val now = nowEpochSeconds()
        val key = key(username, clientIp)
        val state = states[key] ?: return false

        if (state.blockedUntil > now) return true

        // 차단이 해제되고 윈도우도 만료되면 상태를 정리한다.
        if (now - state.windowStartedAt >= windowSeconds) {
            states.remove(key, state)
        }

        return false
    }

    fun recordFailure(
        username: String,
        clientIp: String,
    ): Boolean {
        val now = nowEpochSeconds()
        val key = key(username, clientIp)
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

    fun clear(
        username: String,
        clientIp: String,
    ) {
        states.remove(key(username, clientIp))
    }

    private fun key(
        username: String,
        clientIp: String,
    ): String = "${username.trim().lowercase()}|${clientIp.trim()}"

    private fun nowEpochSeconds(): Long = Instant.now().epochSecond
}
