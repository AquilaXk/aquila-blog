package com.back.boundedContexts.post.adapter.out.internalApi

import com.back.boundedContexts.post.application.port.out.SecureTipPort
import com.back.standard.lib.InternalRestClient
import org.springframework.stereotype.Component

@Component
class SecureTipApiAdapter(
    private val internalRestClient: InternalRestClient,
) : SecureTipPort {
    override fun randomSecureTip(): String {
        val response =
            internalRestClient.get(
                "/member/api/v1/members/randomSecureTip",
            )
        return response.body
    }
}
