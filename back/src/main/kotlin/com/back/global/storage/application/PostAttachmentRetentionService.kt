package com.back.global.storage.application

import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.domain.UploadedFile
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
    private val storageProperties: PostImageStorageProperties,
    private val retentionProperties: UploadedFileRetentionProperties,
    private val clock: Clock,
) {
    @Transactional
    fun syncPostContent(
        postId: Long,
        previousContent: String?,
        currentContent: String,
    ) {
        syncPostAttachmentKeys(
            postId = postId,
            currentKeys = UploadedFileUrlCodec.extractImageObjectKeysFromContent(currentContent),
            previousKeys = UploadedFileUrlCodec.extractImageObjectKeysFromContent(previousContent.orEmpty()),
            purpose = UploadedFilePurpose.POST_IMAGE,
        )
        syncPostAttachmentKeys(
            postId = postId,
            currentKeys = UploadedFileUrlCodec.extractFileObjectKeysFromContent(currentContent),
            previousKeys = UploadedFileUrlCodec.extractFileObjectKeysFromContent(previousContent.orEmpty()),
            purpose = UploadedFilePurpose.POST_FILE,
        )
    }

    @Transactional
    fun scheduleDeletedPostAttachments(content: String) {
        scheduleDeletionForContent(
            purpose = UploadedFilePurpose.POST_IMAGE,
            keys = UploadedFileUrlCodec.extractImageObjectKeysFromContent(content),
        )
        scheduleDeletionForContent(
            purpose = UploadedFilePurpose.POST_FILE,
            keys = UploadedFileUrlCodec.extractFileObjectKeysFromContent(content),
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
            if (uploadedFile.status == UploadedFileStatus.DELETED) return@forEach
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

    private fun now(): Instant = Instant.now(clock)
}
