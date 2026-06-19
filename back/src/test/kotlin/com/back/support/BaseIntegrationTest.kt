package com.back.support

import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.TestPropertySource

@ActiveProfiles("test")
@TestPropertySource(
    properties = [
        "custom.task.processor.enabled=false",
    ],
)
abstract class BaseIntegrationTest
