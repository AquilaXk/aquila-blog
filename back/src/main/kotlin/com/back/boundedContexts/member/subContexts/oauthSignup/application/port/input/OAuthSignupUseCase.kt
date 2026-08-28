package com.back.boundedContexts.member.subContexts.oauthSignup.application.port.input

interface OAuthSignupUseCase {
    fun providerSubjectHash(
        provider: String,
        providerSubject: String,
    ): String

    fun memberLoginId(
        provider: String,
        providerSubjectHash: String,
    ): String

    fun releaseConsumedSignupForMemberLoginId(memberLoginId: String): Int
}
