package com.back.boundedContexts.post.model

enum class PostSummarySource {
    MANUAL,
    LEADING_BLOCK,
    EXTRACTED,
    MIGRATED,
    NONE,
}

enum class PostSummaryMode {
    AUTO,
    MANUAL,
}
