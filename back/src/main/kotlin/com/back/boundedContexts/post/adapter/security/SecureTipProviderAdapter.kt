package com.back.boundedContexts.post.adapter.security

import com.back.boundedContexts.post.application.port.output.SecureTipPort
import com.back.global.security.application.SecurityTipProvider
import org.springframework.stereotype.Component

/**
 * SecureTipProviderAdapter의 책임을 정의하는 클래스입니다.
 * 해당 도메인 흐름에서 역할 분리를 위해 분리된 구성요소입니다.
 */
@Component
class SecureTipProviderAdapter(
    private val securityTipProvider: SecurityTipProvider,
) : SecureTipPort {
    override fun randomSecureTip(): String = securityTipProvider.signupPasswordTip()
}
