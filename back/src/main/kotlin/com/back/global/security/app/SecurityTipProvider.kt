package com.back.global.security.app

import org.springframework.stereotype.Component

@Component
class SecurityTipProvider {
    fun signupPasswordTip(): String = "비밀번호는 영문, 숫자, 특수문자를 조합하여 8자 이상으로 설정하세요."
}
