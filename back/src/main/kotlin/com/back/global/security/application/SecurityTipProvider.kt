package com.back.global.security.application

import org.springframework.stereotype.Component

/**
 * SecurityTipProvider는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
@Component
class SecurityTipProvider {
    fun signupPasswordTip(): String = "비밀번호는 영문, 숫자, 특수문자를 조합하여 8자 이상으로 설정하세요."
}
