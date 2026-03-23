package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.global.security.domain.SecurityUser
import com.back.global.security.domain.toGrantedAuthorities
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.stereotype.Service
import java.util.Locale

/**
 * CustomUserDetailsService는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */

@Service
class CustomUserDetailsService(
    private val actorApplicationService: ActorApplicationService,
) : UserDetailsService {
    /**
     * 외부 인증/사용자 정보를 로드하고 내부 모델로 매핑합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
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
