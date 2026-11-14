package com.back.boundedContexts.post.dto

import com.back.boundedContexts.member.application.port.input.ProfileImageReadUseCase
import com.back.global.storage.domain.UploadedFilePurpose

data class PostImageReadPlanDto(
    val access: ProfileImageReadUseCase.Access,
    val purpose: UploadedFilePurpose,
    val ownerPostId: Long?,
    val referencingPostId: Long?,
)
