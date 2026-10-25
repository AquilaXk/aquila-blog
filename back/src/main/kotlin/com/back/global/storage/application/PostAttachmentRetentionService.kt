package com.back.global.storage.application

import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.config.StoragePropertiesPort
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileOwnerType
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileRetentionReason
import com.back.global.storage.domain.UploadedFileStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant

@Service
class PostAttachmentRetentionService(
    private val uploadedFileRepository: UploadedFileRepositoryPort,
    private val storageProperties: StoragePropertiesPort,
    private val retentionProperties: UploadedFileRetentionProperties,
    private val clock: Clock,
    private val postRepository: PostRepositoryPort? = null,
) {
    @Transactional
    fun syncPostAttachmentKeys(
        postId: Long,
        currentImageObjectKeys: Collection<String>,
        previousImageObjectKeys: Collection<String>,
        currentFileObjectKeys: Collection<String>,
        previousFileObjectKeys: Collection<String>,
    ) {
        syncPostAttachmentKeys(
            postId = postId,
            currentKeys = currentImageObjectKeys.toSet(),
            previousKeys = previousImageObjectKeys.toSet(),
            purpose = UploadedFilePurpose.POST_IMAGE,
        )
        syncPostAttachmentKeys(
            postId = postId,
            currentKeys = currentFileObjectKeys.toSet(),
            previousKeys = previousFileObjectKeys.toSet(),
            purpose = UploadedFilePurpose.POST_FILE,
        )
    }

    @Transactional
    fun scheduleDeletedPostAttachmentKeys(
        imageObjectKeys: Collection<String>,
        fileObjectKeys: Collection<String>,
    ) {
        scheduleDeletionForContent(
            purpose = UploadedFilePurpose.POST_IMAGE,
            keys = imageObjectKeys.toSet(),
        )
        scheduleDeletionForContent(
            purpose = UploadedFilePurpose.POST_FILE,
            keys = fileObjectKeys.toSet(),
        )
    }

    @Transactional
    fun restoreDeletedPostAttachments(
        postId: Long,
        content: String,
    ) {
        restorePostAttachmentKeys(
            postId = postId,
            keys = UploadedFileUrlCodec.extractImageObjectKeysFromContent(content),
            purpose = UploadedFilePurpose.POST_IMAGE,
        )
        restorePostAttachmentKeys(
            postId = postId,
            keys = UploadedFileUrlCodec.extractFileObjectKeysFromContent(content),
            purpose = UploadedFilePurpose.POST_FILE,
        )
    }

    private fun syncPostAttachmentKeys(
        postId: Long,
        currentKeys: Set<String>,
        previousKeys: Set<String>,
        purpose: UploadedFilePurpose,
    ) {
        currentKeys.forEach { objectKey ->
            val uploadedFile = findOrCreate(objectKey)
            if (isProfileOwnedFile(uploadedFile)) return@forEach
            if (hasActiveOwnerPostReference(uploadedFile, postId)) {
                if (uploadedFile.status != UploadedFileStatus.ACTIVE) {
                    uploadedFile.restoreActive()
                    uploadedFileRepository.save(uploadedFile)
                }
                return@forEach
            }
            uploadedFile.attachToPost(postId, purpose)
            uploadedFileRepository.save(uploadedFile)
        }

        (previousKeys - currentKeys).forEach { objectKey ->
            scheduleDeletionIfKnown(
                objectKey = objectKey,
                purpose = purpose,
                reason = UploadedFileRetentionReason.DETACHED_POST_ATTACHMENT,
                purgeAfter = now().plusSeconds(retentionProperties.deletedPostAttachmentSeconds),
            )
        }
    }

    private fun scheduleDeletionForContent(
        keys: Set<String>,
        purpose: UploadedFilePurpose,
    ) {
        keys.forEach { objectKey ->
            scheduleDeletionIfKnown(
                objectKey = objectKey,
                purpose = purpose,
                reason = UploadedFileRetentionReason.DELETED_POST_ATTACHMENT,
                purgeAfter = now().plusSeconds(retentionProperties.deletedPostAttachmentSeconds),
            )
        }
    }

    private fun restorePostAttachmentKeys(
        postId: Long,
        keys: Set<String>,
        purpose: UploadedFilePurpose,
    ) {
        keys.forEach { objectKey ->
            val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey) ?: return@forEach
            if (uploadedFile.status == UploadedFileStatus.DELETED || isProfileOwnedFile(uploadedFile)) return@forEach
            if (hasActiveOwnerPostReference(uploadedFile, postId)) {
                if (uploadedFile.status != UploadedFileStatus.ACTIVE) {
                    uploadedFile.restoreActive()
                    uploadedFileRepository.save(uploadedFile)
                }
                return@forEach
            }
            uploadedFile.attachToPost(postId, purpose)
            uploadedFileRepository.save(uploadedFile)
        }
    }

    private fun scheduleDeletionIfKnown(
        objectKey: String,
        purpose: UploadedFilePurpose,
        reason: UploadedFileRetentionReason,
        purgeAfter: Instant,
    ) {
        if (objectKey.isBlank()) return

        val uploadedFile = uploadedFileRepository.findByObjectKey(objectKey) ?: return
        if (isProfileOwnedFile(uploadedFile)) return

        val existingOwnerId = uploadedFile.ownerId
        if (uploadedFile.ownerType == UploadedFileOwnerType.POST &&
            existingOwnerId != null &&
            postRepository?.existsImageReference(existingOwnerId, objectKey) == true
        ) {
            if (uploadedFile.status != UploadedFileStatus.ACTIVE) {
                uploadedFile.restoreActive()
                uploadedFileRepository.save(uploadedFile)
            }
            return
        }

        val activeReferencingPostId = postRepository?.findFirstReferencingPostId(objectKey)?.takeIf { it > 0L }
        if (activeReferencingPostId != null) {
            uploadedFile.attachToPost(activeReferencingPostId, purpose)
            uploadedFileRepository.save(uploadedFile)
            return
        }

        uploadedFile.purpose = purpose
        uploadedFile.scheduleDeletion(reason, purgeAfter)
        uploadedFileRepository.save(uploadedFile)
    }

    private fun isProfileOwnedFile(uploadedFile: UploadedFile): Boolean =
        uploadedFile.purpose == UploadedFilePurpose.PROFILE_IMAGE ||
            uploadedFile.ownerType == UploadedFileOwnerType.MEMBER_PROFILE

    private fun hasActiveOwnerPostReference(
        uploadedFile: UploadedFile,
        currentPostId: Long,
    ): Boolean {
        val existingOwnerId = uploadedFile.ownerId ?: return false
        if (uploadedFile.ownerType != UploadedFileOwnerType.POST || existingOwnerId == currentPostId) {
            return false
        }
        return postRepository?.existsImageReference(existingOwnerId, uploadedFile.objectKey) == true
    }

    private fun findOrCreate(objectKey: String): UploadedFile =
        uploadedFileRepository.findByObjectKey(objectKey)
            ?: UploadedFile(
                objectKey = objectKey,
                bucket = storageProperties.bucket,
                contentType = "application/octet-stream",
                fileSize = 0,
            )

    private fun now(): Instant = Instant.now(clock)
}
