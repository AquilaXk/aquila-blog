package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.port.input.ProfileImageReadUseCase
import com.back.boundedContexts.post.application.port.input.PostImageReadAccessUseCase
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.dto.PostImageReadPlanDto
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileOwnerType
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class PostImageReadAccessService(
    private val uploadedFileRepository: UploadedFileRepositoryPort,
    private val postRepository: PostRepositoryPort,
    private val profileImageReadUseCase: ProfileImageReadUseCase,
) : PostImageReadAccessUseCase {
    companion object {
        private const val IMAGE_NOT_FOUND_MESSAGE = "이미지를 찾을 수 없습니다."
    }

    @Transactional(readOnly = true)
    override fun resolveReadPlan(
        objectKey: String,
        viewerId: Long?,
        isAdmin: Boolean,
    ): PostImageReadPlanDto {
        val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey) ?: throw postImageNotFound()
        val (access, publicViaOwner) = resolveAccess(objectKey, uploadedFile, viewerId, isAdmin)
        val ownerPostId = uploadedFile.ownerId?.takeIf { it > 0L }
        val referencingPostId =
            if (access != ProfileImageReadUseCase.Access.OWNER_ONLY &&
                uploadedFile.purpose == UploadedFilePurpose.POST_IMAGE &&
                !publicViaOwner
            ) {
                postRepository.findFirstReferencingPostId(uploadedFile.objectKey)?.takeIf { it > 0L }
            } else {
                null
            }
        return PostImageReadPlanDto(
            access = access,
            purpose = uploadedFile.purpose,
            ownerPostId = ownerPostId,
            referencingPostId = referencingPostId,
        )
    }

    private fun resolveAccess(
        objectKey: String,
        uploadedFile: UploadedFile,
        viewerId: Long?,
        isAdmin: Boolean,
    ): Pair<ProfileImageReadUseCase.Access, Boolean> =
        when (uploadedFile.purpose) {
            UploadedFilePurpose.PROFILE_IMAGE ->
                try {
                    profileImageReadUseCase.resolve(objectKey, uploadedFile, viewerId) to false
                } catch (ex: AppException) {
                    resolvePostImageAccess(uploadedFile, isAdmin) { ex }
                }
            UploadedFilePurpose.POST_IMAGE ->
                resolvePostImageAccess(uploadedFile, isAdmin, ::postImageNotFound)
            else -> throw postImageNotFound()
        }

    private fun resolvePostImageAccess(
        uploadedFile: UploadedFile,
        isAdmin: Boolean,
        notFound: () -> AppException,
    ): Pair<ProfileImageReadUseCase.Access, Boolean> {
        if (uploadedFile.status == UploadedFileStatus.TEMP) {
            if (isAdmin) return ProfileImageReadUseCase.Access.OWNER_ONLY to false
            throw notFound()
        }
        if (
            uploadedFile.status != UploadedFileStatus.ACTIVE ||
            (uploadedFile.ownerType != UploadedFileOwnerType.POST && uploadedFile.ownerType != UploadedFileOwnerType.MEMBER_PROFILE)
        ) {
            throw notFound()
        }

        val postId =
            if (uploadedFile.ownerType == UploadedFileOwnerType.POST) {
                uploadedFile.ownerId?.takeIf { it > 0L }
            } else {
                null
            }
        if (postId != null && postRepository.isPublicDetailReadable(postId)) {
            return ProfileImageReadUseCase.Access.PUBLIC to true
        }
        if (postRepository.existsPublicPostReferencingImage(uploadedFile.objectKey)) {
            return ProfileImageReadUseCase.Access.PUBLIC to false
        }
        if (isAdmin &&
            (
                (postId != null && postRepository.existsById(postId)) ||
                    postRepository.existsImageReferenceByObjectKey(uploadedFile.objectKey)
            )
        ) {
            return ProfileImageReadUseCase.Access.OWNER_ONLY to false
        }
        throw notFound()
    }

    private fun postImageNotFound(): AppException = AppException(ErrorCode.NOT_FOUND, IMAGE_NOT_FOUND_MESSAGE)
}
