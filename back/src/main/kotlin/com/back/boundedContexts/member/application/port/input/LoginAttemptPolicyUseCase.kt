package com.back.boundedContexts.member.application.port.input

interface LoginAttemptPolicyUseCase {
    fun isBlocked(
        username: String,
        clientIp: String,
    ): Boolean

    fun recordFailure(
        username: String,
        clientIp: String,
    ): Boolean

    fun clear(
        username: String,
        clientIp: String,
    )
}
