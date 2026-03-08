package com.back.boundedContexts.member.out.shared

import com.back.global.app.app.AppFacade
import com.back.standard.lib.InternalRestClient
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Service

@Service
class MemberApiClient(
    private val internalRestClient: InternalRestClient
) {
    private val authHeaders get() = mapOf(
        HttpHeaders.AUTHORIZATION to "Bearer ${AppFacade.systemMemberApiKey}"
    )

    val randomSecureTip: String
        get() {
            val response = internalRestClient.get(
                "/member/api/v1/members/randomSecureTip",
                authHeaders
            )
            return response.body
        }
}
