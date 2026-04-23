package com.back.support

import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.TestExecutionListeners

@SpringBootTest
@TestExecutionListeners(
    value = [ResetAndSeedTestExecutionListener::class],
    mergeMode = TestExecutionListeners.MergeMode.MERGE_WITH_DEFAULTS,
)
abstract class BaseSeededIntegrationTest : BaseIntegrationTest()
