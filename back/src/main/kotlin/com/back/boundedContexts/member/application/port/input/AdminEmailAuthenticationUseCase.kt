package com.back.boundedContexts.member.application.port.input

interface AdminEmailAuthenticationUseCase {
    fun requestCode(
        email: String,
        rememberMe: Boolean,
    ): RequestedChallenge

    fun verifyCode(
        challengeId: String,
        code: String,
        createdIp: String?,
        userAgent: String?,
    ): MemberUseCase.IssuedLoginSession

    fun verifyReadiness()

    data class RequestedChallenge(
        val challengeId: String,
        val expiresInSeconds: Long,
    )
}
