package com.back.support

import com.back.boundedContexts.member.adapter.mail.AdminLoginMailSender
import org.springframework.test.context.bean.override.mockito.MockitoBean

abstract class BaseAdminEmailAuthenticationFlowIntegrationTest : BaseControllerIntegrationTest() {
    @MockitoBean
    protected lateinit var adminLoginMailSender: AdminLoginMailSender
}
