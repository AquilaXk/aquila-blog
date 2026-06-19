package com.back.global.storage.application

import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.exception.application.AppException
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileOwnerType
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileRetentionReason
import com.back.global.storage.domain.UploadedFileStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant

@Service
class ProfileImageRetentionService(
    private val uploadedFileRepository: UploadedFileRepositoryPort,
    private val postImageStoragePort: PostImageStoragePort,
    private val storageProperties: PostImageStorageProperties,
    private val retentionProperties: UploadedFileRetentionProperties,
    private val transactionManager: PlatformTransactionManager,
    private val clock: Clock,
) {
    private val writeTransactionTemplate = TransactionTemplate(transactionManager)

    @Transactional
    fun syncProfileImage(
        memberId: Long,
        previousProfileImgUrl: String?,
        currentProfileImgUrl: String?,
    ) {
        val previousObjectKey = UploadedFileUrlCodec.extractObjectKeyFromImageUrl(previousProfileImgUrl)
        val currentObjectKey = UploadedFileUrlCodec.extractObjectKeyFromImageUrl(currentProfileImgUrl)

        currentObjectKey?.let { objectKey ->
            val uploadedFile = findOrCreate(objectKey)
            uploadedFile.attachToMemberProfile(memberId)
            uploadedFileRepository.save(uploadedFile)
        }

        if (previousObjectKey != null && previousObjectKey != currentObjectKey) {
            scheduleProfileImageDeletionIfKnown(
                memberId = memberId,
                objectKey = previousObjectKey,
                reason = UploadedFileRetentionReason.REPLACED_PROFILE_IMAGE,
                purgeAfter = now().plusSeconds(retentionProperties.replacedProfileImageSeconds),
            )
        }
    }

    @Transactional(readOnly = true)
    fun listProfileImages(
        memberId: Long,
        protectedProfileImgUrls: Collection<String?>,
    ): List<ProfileImageHistoryDto> {
        val protectedObjectKeys = protectedProfileImgUrls.extractProfileImageObjectKeys()
        val profileImages =
            uploadedFileRepository.findByPurposeAndOwnerTypeAndOwnerIdAndStatusNotOrderByCreatedAtDescIdDesc(
                purpose = UploadedFilePurpose.PROFILE_IMAGE,
                ownerType = UploadedFileOwnerType.MEMBER_PROFILE,
                ownerId = memberId,
                status = UploadedFileStatus.DELETED,
            )

        return profileImages.map { uploadedFile ->
            uploadedFile.toProfileImageHistoryDto(
                isCurrent = uploadedFile.objectKey in protectedObjectKeys,
            )
        }
    }

    fun deleteProfileImage(
        memberId: Long,
        fileId: Long,
        protectedProfileImgUrls: Collection<String?>,
    ) {
        val uploadedFile =
            uploadedFileRepository.findByIdAndPurposeAndOwnerTypeAndOwnerId(
                id = fileId,
                purpose = UploadedFilePurpose.PROFILE_IMAGE,
                ownerType = UploadedFileOwnerType.MEMBER_PROFILE,
                ownerId = memberId,
            )
                ?: throw AppException("404-1", "프로필 이미지를 찾을 수 없습니다.")
        if (uploadedFile.objectKey in protectedProfileImgUrls.extractProfileImageObjectKeys()) {
            throw AppException("400-1", "현재 사용 중인 프로필 이미지는 삭제할 수 없습니다.")
        }

        postImageStoragePort.deletePostImage(uploadedFile.objectKey)
        markProfileImageDeleted(uploadedFile)
    }

    private fun markProfileImageDeleted(uploadedFile: UploadedFile) {
        writeTransactionTemplate.executeWithoutResult {
            uploadedFile.markDeleted()
            uploadedFileRepository.save(uploadedFile)
        }
    }

    private fun scheduleProfileImageDeletionIfKnown(
        memberId: Long,
        objectKey: String,
        reason: UploadedFileRetentionReason,
        purgeAfter: Instant,
    ) {
        if (objectKey.isBlank()) return

        val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey) ?: return
        uploadedFile.purpose = UploadedFilePurpose.PROFILE_IMAGE
        uploadedFile.ownerType = UploadedFileOwnerType.MEMBER_PROFILE
        uploadedFile.ownerId = memberId
        uploadedFile.scheduleDeletion(reason, purgeAfter)
        uploadedFileRepository.save(uploadedFile)
    }

    private fun findOrCreate(objectKey: String): UploadedFile =
        uploadedFileRepository.findByObjectKey(objectKey)
            ?: UploadedFile(
                objectKey = objectKey,
                bucket = storageProperties.bucket,
                contentType = "application/octet-stream",
                fileSize = 0,
            )

    private fun UploadedFile.toProfileImageHistoryDto(isCurrent: Boolean): ProfileImageHistoryDto =
        ProfileImageHistoryDto(
            id = id,
            imageUrl = UploadedFileUrlCodec.buildImageUrl(objectKey),
            objectKey = objectKey,
            contentType = contentType,
            fileSize = fileSize,
            status = status,
            isCurrent = isCurrent,
            createdAt = createdAt,
            modifiedAt = modifiedAt,
        )

    private fun Collection<String?>.extractProfileImageObjectKeys(): Set<String> =
        mapNotNull(UploadedFileUrlCodec::extractObjectKeyFromImageUrl)
            .toSet()

    private fun now(): Instant = Instant.now(clock)
}
