package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.input.ProfileImageReadUseCase
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.application.UploadedFileUrlCodec
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileOwnerType
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileStatus
import org.springframework.stereotype.Component

@Component
class ProfileImageReadPolicy(
    private val memberRepository: MemberRepositoryPort,
    private val canonicalAdminPolicy: CanonicalAdminPolicy,
    private val currentMemberProfileQueryUseCase: CurrentMemberProfileQueryUseCase,
) : ProfileImageReadUseCase {
    override fun resolve(
        objectKey: String,
        uploadedFile: UploadedFile,
        viewerId: Long?,
    ): ProfileImageReadUseCase.Access {
        if (
            uploadedFile.purpose != UploadedFilePurpose.PROFILE_IMAGE ||
            uploadedFile.ownerType != UploadedFileOwnerType.MEMBER_PROFILE
        ) {
            throw notFound()
        }

        val ownerId = uploadedFile.ownerId?.takeIf { it > 0L } ?: throw notFound()
        val owner = memberRepository.findById(ownerId).orElse(null) ?: throw notFound()
        if (!canonicalAdminPolicy.canAuthenticate(owner)) throw notFound()

        if (uploadedFile.status == UploadedFileStatus.ACTIVE) {
            val publishedProfile = currentMemberProfileQueryUseCase.getPublishedById(ownerId)
            val publishedObjectKey = UploadedFileUrlCodec.extractObjectKeyFromImageUrl(publishedProfile.profileImageUrl)
            if (publishedObjectKey == objectKey) return ProfileImageReadUseCase.Access.PUBLIC
        }

        if (viewerId == ownerId && uploadedFile.status != UploadedFileStatus.DELETED) return ProfileImageReadUseCase.Access.OWNER_ONLY

        throw notFound()
    }

    private fun notFound(): AppException = AppException(ErrorCode.NOT_FOUND, "이미지를 찾을 수 없습니다.")
}
