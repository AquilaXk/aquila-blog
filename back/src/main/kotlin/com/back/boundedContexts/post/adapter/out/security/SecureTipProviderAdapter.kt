package com.back.boundedContexts.post.adapter.out.security

import com.back.boundedContexts.post.application.port.out.SecureTipPort
import com.back.global.security.app.SecurityTipProvider
import org.springframework.stereotype.Component

@Component
class SecureTipProviderAdapter(
    private val securityTipProvider: SecurityTipProvider,
) : SecureTipPort {
    override fun randomSecureTip(): String = securityTipProvider.signupPasswordTip()
}
