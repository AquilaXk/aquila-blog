package com.back.global.security.config

import com.back.boundedContexts.cloud.config.CloudSecurityConfigurer
import com.back.boundedContexts.member.config.MemberSecurityConfigurer
import com.back.boundedContexts.member.config.shared.AuthSecurityConfigurer
import com.back.boundedContexts.post.config.PostSecurityConfigurer

object TestPublicApiRequestMatchers {
    fun defaultMatcher(legacyDirectJoinEnabled: Boolean = false): PublicApiRequestMatcher =
        PublicApiRequestMatcher(
            listOf(
                PostSecurityConfigurer(),
                CloudSecurityConfigurer(),
                AuthSecurityConfigurer(),
                MemberSecurityConfigurer(legacyDirectJoinEnabled),
            ),
        )
}
