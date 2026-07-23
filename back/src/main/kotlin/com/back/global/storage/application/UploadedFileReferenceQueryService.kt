package com.back.global.storage.application

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileOwnerType
import org.springframework.stereotype.Service

@Service
class UploadedFileReferenceQueryService(
    private val postRepository: PostRepositoryPort,
    private val memberAttrRepository: MemberAttrRepositoryPort,
) {
    fun findReferencedObjectKeys(candidates: Collection<UploadedFile>): Set<String> {
        if (candidates.isEmpty()) return emptySet()

        val referencedKeys = linkedSetOf<String>()
        candidates.forEach { uploadedFile ->
            if (isReferencedByKnownOwner(uploadedFile) || isReferencedByFallbackLookup(uploadedFile)) {
                referencedKeys += uploadedFile.objectKey
            }
        }
        return referencedKeys
    }

    private fun isReferencedByKnownOwner(uploadedFile: UploadedFile): Boolean {
        val ownerId = uploadedFile.ownerId ?: return false
        return when (uploadedFile.ownerType) {
            UploadedFileOwnerType.POST -> postRepository.existsByIdAndContentContaining(ownerId, uploadedFile.objectKey)
            UploadedFileOwnerType.MEMBER_PROFILE ->
                memberAttrRepository.existsBySubjectIdAndNameAndStrValueContaining(
                    ownerId,
                    PROFILE_IMG_URL,
                    uploadedFile.objectKey,
                )
            else -> false
        }
    }

    private fun isReferencedByFallbackLookup(uploadedFile: UploadedFile): Boolean {
        val objectKey = uploadedFile.objectKey
        val imageUrl = UploadedFileUrlCodec.buildImageUrl(objectKey)
        val fileUrl = UploadedFileUrlCodec.buildFileUrl(objectKey)
        return postRepository.existsByContentContaining(objectKey) ||
            postRepository.existsByContentContaining(fileUrl) ||
            memberAttrRepository.existsByNameAndStrValueContaining(PROFILE_IMG_URL, objectKey) ||
            memberAttrRepository.existsByNameAndStrValue(PROFILE_IMG_URL, imageUrl)
    }
}
