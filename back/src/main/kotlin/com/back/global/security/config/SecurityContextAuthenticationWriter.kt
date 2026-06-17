package com.back.global.security.config

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.security.domain.SecurityUser
import com.back.global.security.domain.toGrantedAuthorities
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component

/**
 * 인증된 회원을 Spring SecurityContext 인증 객체로 변환해 기록합니다.
 */
@Component
class SecurityContextAuthenticationWriter {
    fun write(member: Member) {
        val user =
            SecurityUser(
                member.id,
                member.username,
                "",
                member.name,
                member.toGrantedAuthorities(),
            )
        val authentication =
            UsernamePasswordAuthenticationToken(user, user.password, user.authorities)

        SecurityContextHolder.getContext().authentication = authentication
    }
}
