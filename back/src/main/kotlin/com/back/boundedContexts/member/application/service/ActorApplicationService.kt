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

/**
 * ActorApplicationService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
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
    override fun findByUsername(username: String): Member? = memberRepository.findByUsername(username)

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

    fun payload(accessToken: String) = authTokenService.payload(accessToken)

    @Transactional(readOnly = true)
    fun findById(id: Long): Member? = memberRepository.findById(id).getOrNull()

    fun getReferenceById(id: Long): Member = memberRepository.getReferenceById(id)
}
