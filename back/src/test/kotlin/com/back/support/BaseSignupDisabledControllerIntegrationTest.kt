package com.back.support

import org.springframework.test.context.TestPropertySource

@TestPropertySource(
    properties = [
        "custom.member.signup.enabled=false",
    ],
)
abstract class BaseSignupDisabledControllerIntegrationTest : BaseControllerIntegrationTest()
