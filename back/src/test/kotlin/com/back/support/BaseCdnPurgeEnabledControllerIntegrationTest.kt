package com.back.support

import org.springframework.test.context.TestPropertySource

@TestPropertySource(
    properties = [
        "custom.cdn.purge.enabled=true",
        "custom.cdn.purge.url=https://cdn.test.invalid/purge",
        "custom.cdn.purge.token=test-token",
    ],
)
abstract class BaseCdnPurgeEnabledControllerIntegrationTest : BaseControllerIntegrationTest()
