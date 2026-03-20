package com.back.global.security.domain

import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.userdetails.User
import org.springframework.security.oauth2.core.user.OAuth2User

/**
 * SecurityUser는 글로벌 모듈 도메인 상태와 규칙을 표현하는 모델입니다.
 * 불변조건을 유지하며 상태 전이를 메서드 단위로 캡슐화합니다.
 */
class SecurityUser(
    val id: Long,
    username: String,
    password: String,
    val nickname: String,
    authorities: Collection<GrantedAuthority>,
) : User(username, password, authorities),
    OAuth2User {
    override fun getAttributes(): Map<String, Any> = emptyMap()

    override fun getName(): String = username
}
