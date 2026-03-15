package com.back.boundedContexts.member.subContexts.signupVerification.adapter.persistence

import com.back.boundedContexts.member.subContexts.signupVerification.application.port.output.MemberSignupVerificationRepositoryPort
import com.back.boundedContexts.member.subContexts.signupVerification.domain.MemberSignupVerification
import org.springframework.stereotype.Component

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
