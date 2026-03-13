package com.back.support

import org.springframework.test.annotation.DirtiesContext
import org.springframework.test.context.TestExecutionListeners

@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@TestExecutionListeners(
    value = [ResetAndSeedTestExecutionListener::class],
    mergeMode = TestExecutionListeners.MergeMode.MERGE_WITH_DEFAULTS,
)
abstract class SeededSpringBootTestSupport
