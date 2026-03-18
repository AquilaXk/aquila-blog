package com.back.boundedContexts.member.subContexts.signupVerification.adapter.persistence

import com.back.boundedContexts.member.subContexts.signupVerification.application.port.output.MemberSignupVerificationRepositoryPort
import com.back.boundedContexts.member.subContexts.signupVerification.domain.MemberSignupVerification
import org.springframework.stereotype.Component

/**
 * MemberSignupVerificationRepositoryAdapter는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
@Component
class MemberSignupVerificationRepositoryAdapter(
    private val memberSignupVerificationRepository: MemberSignupVerificationRepository,
) : MemberSignupVerificationRepositoryPort {
    override fun save(memberSignupVerification: MemberSignupVerification): MemberSignupVerification =
        memberSignupVerificationRepository.save(memberSignupVerification)

    override fun findByEmailVerificationToken(emailVerificationToken: String): MemberSignupVerification? =
        memberSignupVerificationRepository.findByEmailVerificationToken(emailVerificationToken)

    override fun findBySignupSessionToken(signupSessionToken: String): MemberSignupVerification? =
        memberSignupVerificationRepository.findBySignupSessionToken(signupSessionToken)

    override fun findTopByEmail(email: String): MemberSignupVerification? =
        memberSignupVerificationRepository.findTopByEmailOrderByCreatedAtDesc(email)
}
