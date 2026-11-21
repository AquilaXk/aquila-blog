package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.AuthTokenIssueUseCase
import com.back.boundedContexts.member.application.port.input.MemberUseCase.IssuedLoginSession
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class MemberLoginSessionIssueService(
    private val memberRepository: MemberRepositoryPort,
    private val memberApplicationService: MemberApplicationService,
    private val memberSessionUseCase: MemberSessionUseCase,
    private val authTokenIssueUseCase: AuthTokenIssueUseCase,
    private val canonicalAdminPolicy: CanonicalAdminPolicy,
) {
    @Transactional
    fun issueAdminEmail(
        email: String,
        nickname: String,
        rememberLoginEnabled: Boolean,
        createdIp: String?,
        userAgent: String?,
    ): IssuedLoginSession {
        val member = memberApplicationService.ensureVerifiedEmailIdentity(email, nickname)
        return issueInternal(
            memberId = member.id,
            rememberLoginEnabled = rememberLoginEnabled,
            createdIp = createdIp,
            userAgent = userAgent,
        )
    }

    private fun issueInternal(
        memberId: Long,
        rememberLoginEnabled: Boolean,
        createdIp: String?,
        userAgent: String?,
    ): IssuedLoginSession {
        val member =
            memberRepository
                .findByIdForUpdate(memberId)
                .orElseThrow { AppException(ErrorCode.NOT_FOUND, "회원을 찾을 수 없습니다.") }

        if (!member.isAdmin) member.grantAdmin()
        if (!canonicalAdminPolicy.canAuthenticate(member)) {
            throw AppException(ErrorCode.UNAUTHORIZED, "로그인 후 이용해주세요.")
        }

        if (!member.password.isNullOrBlank()) {
            member.password = null
        }
        memberSessionUseCase.revokeAllActiveSessionsForMember(member.id)

        member.applyLoginSecurityPolicy(
            rememberLoginEnabled = rememberLoginEnabled,
            ipSecurityEnabled = false,
            ipSecurityFingerprint = null,
        )
        member.modifyApiKey(MemberPolicy.genApiKey())

        val createdSession =
            memberSessionUseCase.createSessionWithRefreshToken(
                member = member,
                rememberLoginEnabled = rememberLoginEnabled,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = createdIp,
                userAgent = userAgent,
            )
        val session = createdSession.session
        val accessToken =
            authTokenIssueUseCase.genAccessToken(
                member = member,
                sessionKey = session.sessionKey,
                rememberLoginEnabled = session.rememberLoginEnabled,
                ipSecurityEnabled = session.ipSecurityEnabled,
                ipSecurityFingerprint = session.ipSecurityFingerprint,
            )

        return IssuedLoginSession(
            member = member,
            apiKey = member.apiKey,
            accessToken = accessToken,
            refreshToken = createdSession.refreshToken,
            sessionKey = session.sessionKey,
            rememberLoginEnabled = session.rememberLoginEnabled,
        )
    }
}
