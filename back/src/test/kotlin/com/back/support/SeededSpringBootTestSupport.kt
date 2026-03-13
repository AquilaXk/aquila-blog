package com.back.support

import org.springframework.test.context.TestExecutionListeners
import org.springframework.test.context.TestExecutionListeners.MergeMode.MERGE_WITH_DEFAULTS

@TestExecutionListeners(
    listeners = [ResetAndSeedTestExecutionListener::class],
    mergeMode = MERGE_WITH_DEFAULTS,
)
abstract class SeededSpringBootTestSupport
