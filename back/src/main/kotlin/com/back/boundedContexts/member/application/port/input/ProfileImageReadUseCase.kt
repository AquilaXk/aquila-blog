package com.back.boundedContexts.member.application.port.input

import com.back.global.storage.domain.UploadedFile

interface ProfileImageReadUseCase {
    enum class Access {
        PUBLIC,
        OWNER_ONLY,
    }

    fun resolve(
        objectKey: String,
        uploadedFile: UploadedFile,
        viewerId: Long?,
    ): Access
}
