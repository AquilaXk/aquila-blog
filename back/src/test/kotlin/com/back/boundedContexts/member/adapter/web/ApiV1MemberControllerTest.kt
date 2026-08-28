package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.support.BaseControllerIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.web.servlet.post

@org.junit.jupiter.api.DisplayName("ApiV1MemberController 테스트")
class ApiV1MemberControllerTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Test
    @WithUserDetails("admin@test.com")
    fun `직접 회원가입 route는 존재하지 않고 회원을 생성하지 않는다`() {
        mvc
            .post("/member/api/v1/members") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "username": "retired-signup-user",
                        "password": "Abcd1234!",
                        "nickname": "미생성"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isNotFound() }
            }

        assertThat(memberFacade.findByLoginId("retired-signup-user")).isNull()
    }
}
