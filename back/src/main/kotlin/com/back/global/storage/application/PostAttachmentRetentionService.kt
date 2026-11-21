package com.back.global.storage.application

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_WORKSPACE_DRAFT
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_WORKSPACE_PUBLISHED
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
    private val memberAttrRepository: MemberAttrRepositoryPort? = null,
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
        val partitionedKeys = UploadedFileUrlCodec.extractPartitionedObjectKeysFromContent(content)
        restorePostAttachmentKeys(
            postId = postId,
            keys = partitionedKeys.imageKeys,
            purpose = UploadedFilePurpose.POST_IMAGE,
        )
        restorePostAttachmentKeys(
            postId = postId,
            keys = partitionedKeys.fileKeys,
            purpose = UploadedFilePurpose.POST_FILE,
        )
    }

    private fun syncPostAttachmentKeys(
        postId: Long,
        currentKeys: Set<String>,
        previousKeys: Set<String>,
        purpose: UploadedFilePurpose,
    ) {
        val detachedKeys = previousKeys - currentKeys
        val lookupKeys =
            buildSet(currentKeys.size + detachedKeys.size) {
                currentKeys.forEach { if (it.isNotBlank()) add(it) }
                detachedKeys.forEach { if (it.isNotBlank()) add(it) }
            }
        if (lookupKeys.isEmpty()) return

        val existingByKey =
            uploadedFileRepository
                .findByObjectKeyIn(lookupKeys)
                .associateByTo(HashMap(lookupKeys.size)) { it.objectKey }
        val toSave = ArrayList<UploadedFile>(lookupKeys.size)

        currentKeys.forEach { objectKey ->
            if (objectKey.isBlank()) return@forEach
            val uploadedFile =
                existingByKey[objectKey]
                    ?: if (purpose == UploadedFilePurpose.POST_IMAGE) {
                        newPostImageRecord(objectKey)
                    } else {
                        return@forEach
                    }
            if (isProfileOwnedFile(uploadedFile) || hasActiveOwnerPostReference(uploadedFile, postId)) return@forEach
            uploadedFile.attachToPost(postId, purpose)
            toSave.add(uploadedFile)
        }

        if (detachedKeys.isNotEmpty()) {
            val purgeAfter = now().plusSeconds(retentionProperties.deletedPostAttachmentSeconds)
            detachedKeys.forEach { objectKey ->
                if (objectKey.isBlank()) return@forEach
                val uploadedFile = existingByKey[objectKey] ?: return@forEach
                collectScheduledDeletionIfKnown(
                    uploadedFile = uploadedFile,
                    purpose = purpose,
                    reason = UploadedFileRetentionReason.DETACHED_POST_ATTACHMENT,
                    purgeAfter = purgeAfter,
                    toSave = toSave,
                )
            }
        }

        if (toSave.isNotEmpty()) {
            uploadedFileRepository.saveAllUploadedFiles(toSave)
        }
    }

    private fun scheduleDeletionForContent(
        keys: Set<String>,
        purpose: UploadedFilePurpose,
    ) {
        val targetKeys = keys.filter { it.isNotBlank() }
        if (targetKeys.isEmpty()) return

        val existingByKey =
            uploadedFileRepository
                .findByObjectKeyIn(targetKeys)
                .associateByTo(HashMap(targetKeys.size)) { it.objectKey }
        val toSave = ArrayList<UploadedFile>(existingByKey.size)
        val purgeAfter = now().plusSeconds(retentionProperties.deletedPostAttachmentSeconds)

        targetKeys.forEach { objectKey ->
            val uploadedFile = existingByKey[objectKey] ?: return@forEach
            collectScheduledDeletionIfKnown(
                uploadedFile = uploadedFile,
                purpose = purpose,
                reason = UploadedFileRetentionReason.DELETED_POST_ATTACHMENT,
                purgeAfter = purgeAfter,
                toSave = toSave,
            )
        }

        if (toSave.isNotEmpty()) {
            uploadedFileRepository.saveAllUploadedFiles(toSave)
        }
    }

    private fun restorePostAttachmentKeys(
        postId: Long,
        keys: Set<String>,
        purpose: UploadedFilePurpose,
    ) {
        val targetKeys = keys.filter { it.isNotBlank() }
        if (targetKeys.isEmpty()) return

        val existingByKey =
            uploadedFileRepository
                .findByObjectKeyIn(targetKeys)
                .associateByTo(HashMap(targetKeys.size)) { it.objectKey }
        val toSave = ArrayList<UploadedFile>(existingByKey.size)

        targetKeys.forEach { objectKey ->
            val uploadedFile = existingByKey[objectKey] ?: return@forEach
            if (uploadedFile.status == UploadedFileStatus.DELETED ||
                isProfileOwnedFile(uploadedFile) ||
                hasActiveOwnerPostReference(uploadedFile, postId)
            ) {
                return@forEach
            }
            uploadedFile.attachToPost(postId, purpose)
            toSave.add(uploadedFile)
        }

        if (toSave.isNotEmpty()) {
            uploadedFileRepository.saveAllUploadedFiles(toSave)
        }
    }

    private fun collectScheduledDeletionIfKnown(
        uploadedFile: UploadedFile,
        purpose: UploadedFilePurpose,
        reason: UploadedFileRetentionReason,
        purgeAfter: Instant,
        toSave: MutableList<UploadedFile>,
    ) {
        if (isProfileOwnedFile(uploadedFile)) return

        val objectKey = uploadedFile.objectKey
        val existingOwnerId = uploadedFile.ownerId
        if (uploadedFile.ownerType == UploadedFileOwnerType.POST &&
            existingOwnerId != null &&
            postRepository?.existsImageReference(existingOwnerId, objectKey) == true
        ) {
            return
        }

        val activeReferencingPostId = postRepository?.findFirstReferencingPostId(objectKey)?.takeIf { it > 0L }
        if (activeReferencingPostId != null) {
            uploadedFile.attachToPost(activeReferencingPostId, purpose)
            toSave.add(uploadedFile)
            return
        }

        uploadedFile.purpose = purpose
        uploadedFile.scheduleDeletion(reason, purgeAfter)
        toSave.add(uploadedFile)
    }

    private fun isProfileOwnedFile(uploadedFile: UploadedFile): Boolean =
        uploadedFile.purpose == UploadedFilePurpose.PROFILE_IMAGE ||
            uploadedFile.ownerType == UploadedFileOwnerType.MEMBER_PROFILE ||
            memberAttrRepository?.existsByNameAndStrValueContaining(PROFILE_WORKSPACE_DRAFT, uploadedFile.objectKey) == true ||
            memberAttrRepository?.existsByNameAndStrValueContaining(PROFILE_WORKSPACE_PUBLISHED, uploadedFile.objectKey) == true

    private fun hasActiveOwnerPostReference(
        uploadedFile: UploadedFile,
        currentPostId: Long,
    ): Boolean {
        val existingOwnerId = uploadedFile.ownerId ?: return false
        return uploadedFile.ownerType == UploadedFileOwnerType.POST &&
            existingOwnerId != currentPostId &&
            postRepository?.existsImageReference(existingOwnerId, uploadedFile.objectKey) == true
    }

    private fun newPostImageRecord(objectKey: String): UploadedFile =
        UploadedFile(
            objectKey = objectKey,
            bucket = storageProperties.bucket,
            contentType = "application/octet-stream",
            fileSize = 0,
        )

    private fun now(): Instant = Instant.now(clock)
}
