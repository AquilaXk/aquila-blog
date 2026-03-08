package com.back.global.security.config

import com.back.boundedContexts.member.app.shared.ActorFacade
import com.back.global.security.domain.SecurityUser
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.stereotype.Service

@Service
class CustomUserDetailsService(
    private val actorFacade: ActorFacade,
) : UserDetailsService {
    override fun loadUserByUsername(username: String): UserDetails {
        val member = actorFacade.findByUsername(username)
            ?: throw UsernameNotFoundException("사용자를 찾을 수 없습니다.")

        return SecurityUser(
            member.id,
            member.username,
            member.password ?: "",
            member.nickname,
            member.authorities,
        )
    }
}
