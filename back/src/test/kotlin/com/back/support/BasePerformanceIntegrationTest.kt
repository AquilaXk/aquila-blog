package com.back.support

import org.springframework.test.context.TestPropertySource

@TestPropertySource(
    properties = [
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.task.scheduling.enabled=false",
        "custom.task.processor.enabled=false",
    ],
)
abstract class BasePerformanceIntegrationTest : BaseControllerIntegrationTest()
