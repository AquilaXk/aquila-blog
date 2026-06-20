package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.global.security.domain.SecurityUser
import com.back.global.security.domain.toGrantedAuthorities
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.stereotype.Service
import java.util.Locale

@Service
class CustomUserDetailsService(
    private val actorApplicationService: ActorApplicationService,
) : UserDetailsService {
    override fun loadUserByUsername(username: String): UserDetails {
        val normalizedIdentifier = username.trim()
        if (!normalizedIdentifier.contains("@")) throw UsernameNotFoundException("사용자를 찾을 수 없습니다.")

        val member =
            actorApplicationService.findByEmail(normalizedIdentifier.lowercase(Locale.ROOT))
                ?: throw UsernameNotFoundException("사용자를 찾을 수 없습니다.")

        return SecurityUser(
            member.id,
            member.username,
            member.password ?: "",
            member.nickname,
            member.toGrantedAuthorities(),
        )
    }
}
