package com.back.boundedContexts.post.adapter.out.internalApi

import com.back.boundedContexts.post.application.port.out.SecureTipPort
import com.back.global.app.app.AppFacade
import com.back.standard.lib.InternalRestClient
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component

@Component
class SecureTipApiAdapter(
    private val internalRestClient: InternalRestClient,
) : SecureTipPort {
    private val authHeaders: Map<String, String>
        get() =
            mapOf(
                HttpHeaders.AUTHORIZATION to "Bearer ${AppFacade.systemMemberApiKey}",
            )

    override fun randomSecureTip(): String {
        val response =
            internalRestClient.get(
                "/member/api/v1/members/randomSecureTip",
                authHeaders,
            )
        return response.body
    }
}
