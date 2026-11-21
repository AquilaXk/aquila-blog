package com.back.support

import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.TestPropertySource

@ActiveProfiles("test")
@TestPropertySource(
    properties = [
        "custom.task.processor.enabled=false",
        "custom.bootstrap.seed-demo-data-enabled=true",
    ],
)
abstract class BaseIntegrationTest
