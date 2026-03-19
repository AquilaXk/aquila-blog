package com.back.boundedContexts.post.application.port.input

import com.back.boundedContexts.post.dto.PostPreviewSummaryResult

interface PostPreviewSummaryUseCase {
    fun generate(
        title: String,
        content: String,
        maxLength: Int,
    ): PostPreviewSummaryResult
}
