package com.back.boundedContexts.post.application.port.input

import com.back.boundedContexts.post.dto.PostImageReadPlanDto

interface PostImageReadAccessUseCase {
    fun resolveReadPlan(
        objectKey: String,
        viewerId: Long?,
        isAdmin: Boolean,
    ): PostImageReadPlanDto
}
