package com.back.boundedContexts.post.adapter.security

import com.back.boundedContexts.post.application.port.output.SecureTipPort
import com.back.global.security.application.SecurityTipProvider
import org.springframework.stereotype.Component

@Component
class SecureTipProviderAdapter(
    private val securityTipProvider: SecurityTipProvider,
) : SecureTipPort {
    override fun randomSecureTip(): String = securityTipProvider.signupPasswordTip()
}
