package com.back.support

import org.springframework.test.context.TestExecutionListeners

@TestExecutionListeners(
    value = [ResetAndSeedTestExecutionListener::class],
    mergeMode = TestExecutionListeners.MergeMode.MERGE_WITH_DEFAULTS,
)
abstract class SeededSpringBootTestSupport
