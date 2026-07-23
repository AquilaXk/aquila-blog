package com.back.support

@Deprecated(
    message = "Use BaseControllerIntegrationTest or BaseTransactionalIntegrationTest.",
    replaceWith = ReplaceWith("BaseControllerIntegrationTest"),
)
abstract class SeededSpringBootTestSupport : BaseControllerIntegrationTest()
