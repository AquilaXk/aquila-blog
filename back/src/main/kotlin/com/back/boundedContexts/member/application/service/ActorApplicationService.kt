package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.ActorQueryUseCase
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberProxy
import com.back.global.security.domain.SecurityUser
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.Locale
import kotlin.jvm.optionals.getOrNull

@Service
class ActorApplicationService(
    private val authTokenService: AuthTokenService,
    private val memberRepository: MemberRepositoryPort,
) : ActorQueryUseCase {
    @Transactional(readOnly = true)
    fun memberOf(securityUser: SecurityUser): Member {
        val realMember = getReferenceById(securityUser.id)
        return MemberProxy(realMember, securityUser.id, securityUser.username, securityUser.nickname)
    }

    @Transactional(readOnly = true)
    override fun findByLoginId(loginId: String): Member? = memberRepository.findByLoginId(loginId)

    @Transactional(readOnly = true)
    override fun findByEmail(email: String): Member? =
        memberRepository.findByEmail(
            email
                .trim()
                .lowercase(Locale.ROOT),
        )

    @Transactional(readOnly = true)
    fun findByApiKey(apiKey: String): Member? = memberRepository.findByApiKey(apiKey)

    fun genAccessToken(member: Member): String = authTokenService.genAccessToken(member)

    fun genAccessToken(
        member: Member,
        sessionKey: String?,
        rememberLoginEnabled: Boolean,
        ipSecurityEnabled: Boolean,
        ipSecurityFingerprint: String?,
    ): String =
        authTokenService.genAccessToken(
            member = member,
            sessionKey = sessionKey,
            rememberLoginEnabled = rememberLoginEnabled,
            ipSecurityEnabled = ipSecurityEnabled,
            ipSecurityFingerprint = ipSecurityFingerprint,
        )

    fun payload(accessToken: String) = authTokenService.payload(accessToken)

    @Transactional(readOnly = true)
    fun findById(id: Long): Member? = memberRepository.findById(id).getOrNull()

    fun getReferenceById(id: Long): Member = memberRepository.getReferenceById(id)
}
