package com.back.global.storage.app

import com.back.boundedContexts.member.application.port.out.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.post.application.port.out.PostImageStoragePort
import com.back.boundedContexts.post.application.port.out.PostRepositoryPort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileRetentionReason
import com.back.global.storage.domain.UploadedFileStatus
import com.back.global.storage.out.UploadedFileRepository
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class UploadedFileRetentionService(
    private val uploadedFileRepository: UploadedFileRepository,
    private val postRepository: PostRepositoryPort,
    private val memberAttrRepository: MemberAttrRepositoryPort,
    private val postImageStoragePort: PostImageStoragePort,
    private val storageProperties: PostImageStorageProperties,
    private val retentionProperties: UploadedFileRetentionProperties,
) {
    private val logger = LoggerFactory.getLogger(UploadedFileRetentionService::class.java)

    @Transactional
    fun registerTempUpload(
        objectKey: String,
        contentType: String,
        fileSize: Long,
        purpose: UploadedFilePurpose,
    ) {
        val uploadedFile =
            findOrCreate(objectKey).apply {
                bucket = storageProperties.bucket
                this.contentType = contentType.ifBlank { "application/octet-stream" }
                this.fileSize = fileSize.coerceAtLeast(0)
                markTemporary(purpose, Instant.now().plusSeconds(retentionProperties.tempUploadSeconds))
            }

        uploadedFileRepository.save(uploadedFile)
    }

    @Transactional
    fun syncPostContent(
        postId: Int,
        previousContent: String?,
        currentContent: String,
    ) {
        val previousKeys = UploadedFileUrlCodec.extractObjectKeysFromContent(previousContent.orEmpty())
        val currentKeys = UploadedFileUrlCodec.extractObjectKeysFromContent(currentContent)

        currentKeys.forEach { objectKey ->
            val uploadedFile = findOrCreate(objectKey)
            uploadedFile.attachToPost(postId)
            uploadedFileRepository.save(uploadedFile)
        }

        (previousKeys - currentKeys).forEach { objectKey ->
            scheduleDeletionIfKnown(
                objectKey = objectKey,
                purpose = UploadedFilePurpose.POST_IMAGE,
                reason = UploadedFileRetentionReason.DETACHED_POST_ATTACHMENT,
                purgeAfter = Instant.now().plusSeconds(retentionProperties.deletedPostAttachmentSeconds),
            )
        }
    }

    @Transactional
    fun scheduleDeletedPostAttachments(content: String) {
        UploadedFileUrlCodec.extractObjectKeysFromContent(content).forEach { objectKey ->
            scheduleDeletionIfKnown(
                objectKey = objectKey,
                purpose = UploadedFilePurpose.POST_IMAGE,
                reason = UploadedFileRetentionReason.DELETED_POST_ATTACHMENT,
                purgeAfter = Instant.now().plusSeconds(retentionProperties.deletedPostAttachmentSeconds),
            )
        }
    }

    @Transactional
    fun syncProfileImage(
        memberId: Int,
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
            scheduleDeletionIfKnown(
                objectKey = previousObjectKey,
                purpose = UploadedFilePurpose.PROFILE_IMAGE,
                reason = UploadedFileRetentionReason.REPLACED_PROFILE_IMAGE,
                purgeAfter = Instant.now().plusSeconds(retentionProperties.replacedProfileImageSeconds),
            )
        }
    }

    @Transactional
    fun purgeExpiredFiles(limit: Int) {
        val safeLimit = limit.coerceIn(1, 500)
        val candidates =
            uploadedFileRepository.findByStatusAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
                status = UploadedFileStatus.PENDING_DELETE,
                purgeAfter = Instant.now(),
                pageable = PageRequest.of(0, safeLimit),
            )

        candidates.forEach { uploadedFile ->
            if (isStillReferenced(uploadedFile.objectKey)) {
                uploadedFile.restoreActive()
                uploadedFileRepository.save(uploadedFile)
                return@forEach
            }

            try {
                postImageStoragePort.deletePostImage(uploadedFile.objectKey)
                uploadedFile.markDeleted()
                uploadedFileRepository.save(uploadedFile)
            } catch (exception: Exception) {
                logger.error("Failed to purge uploaded file: {}", uploadedFile.objectKey, exception)
            }
        }
    }

    private fun scheduleDeletionIfKnown(
        objectKey: String,
        purpose: UploadedFilePurpose,
        reason: UploadedFileRetentionReason,
        purgeAfter: Instant,
    ) {
        val uploadedFile = findOrCreate(objectKey)
        uploadedFile.purpose = purpose
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

    private fun isStillReferenced(objectKey: String): Boolean {
        val imageUrl = UploadedFileUrlCodec.buildImageUrl(objectKey)
        val relativeImagePath = UploadedFileUrlCodec.buildRelativeImagePath(objectKey)
        return postRepository.existsByContentContaining(imageUrl) ||
            postRepository.existsByContentContaining(relativeImagePath) ||
            memberAttrRepository.existsByNameAndStrValue(PROFILE_IMG_URL, imageUrl)
    }
}
