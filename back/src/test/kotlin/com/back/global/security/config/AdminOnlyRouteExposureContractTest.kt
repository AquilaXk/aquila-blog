package com.back.global.security.config

import com.back.support.BaseControllerIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.http.HttpMethod
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.web.util.ServletRequestPathUtils
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping

@DisplayName("Admin-only route exposure contract")
class AdminOnlyRouteExposureContractTest : BaseControllerIntegrationTest() {
    @jakarta.annotation.Resource
    private lateinit var requestMappingHandlerMapping: RequestMappingHandlerMapping

    @Test
    fun `retires public member and interaction route mappings while retaining blog and admin routes`() {
        listOf(
            HttpMethod.GET to "/member/api/v1/auth/me",
            HttpMethod.POST to "/member/api/v1/auth/legal-reconsent",
            HttpMethod.GET to "/member/api/v1/members/1/redirectToProfileImg",
            HttpMethod.POST to "/member/api/v1/members",
            HttpMethod.GET to "/member/api/v1/privacy/export",
            HttpMethod.POST to "/member/api/v1/privacy/requests",
            HttpMethod.DELETE to "/member/api/v1/privacy/account",
            HttpMethod.POST to "/member/api/v1/signup/email/start",
            HttpMethod.GET to "/member/api/v1/signup/email/verify",
            HttpMethod.POST to "/member/api/v1/signup/social/complete",
            HttpMethod.GET to "/member/api/v1/notifications/stream",
            HttpMethod.GET to "/post/api/v1/posts/1/comments",
            HttpMethod.POST to "/post/api/v1/posts/1/comments",
            HttpMethod.PUT to "/post/api/v1/posts/1/like",
            HttpMethod.DELETE to "/post/api/v1/posts/1/like",
        ).forEach { (method, path) ->
            assertThat(hasHandlerMethod(method, path))
                .describedAs("%s %s must not remain mapped", method, path)
                .isFalse()
        }

        listOf(
            HttpMethod.POST to "/member/api/v1/auth/login",
            HttpMethod.DELETE to "/member/api/v1/auth/logout",
            HttpMethod.GET to "/member/api/v1/auth/session",
            HttpMethod.GET to "/post/api/v1/posts/feed",
            HttpMethod.GET to "/post/api/v1/posts/1",
            HttpMethod.POST to "/post/api/v1/posts/1/hit",
            HttpMethod.GET to "/post/api/v1/adm/posts/bootstrap",
        ).forEach { (method, path) ->
            assertThat(hasHandlerMethod(method, path))
                .describedAs("%s %s must remain mapped", method, path)
                .isTrue()
        }
    }

    private fun hasHandlerMethod(
        method: HttpMethod,
        path: String,
    ): Boolean {
        val request = MockHttpServletRequest(method.name(), path)
        ServletRequestPathUtils.parseAndCache(request)
        return requestMappingHandlerMapping.handlerMethods.keys.any { mapping ->
            mapping.getMatchingCondition(request) != null
        }
    }
}
