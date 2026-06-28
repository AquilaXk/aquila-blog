package com.back.global.storage.application

import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileStatus
import com.fasterxml.jackson.annotation.JsonProperty
import org.springframework.stereotype.Service
import java.time.Instant

data class UploadedFileCleanupDiagnostics(
    val tempCount: Long,
    val activeCount: Long,
    val pendingDeleteCount: Long,
    val deletedCount: Long,
    val eligibleForPurgeCount: Long,
    val cleanupSafetyThreshold: Int,
    val blockedBySafetyThreshold: Boolean,
    val oldestEligiblePurgeAfter: Instant?,
    val sampleEligibleObjectKeys: List<String>,
    val reconcile: UploadedFileReconcileDiagnostics,
)

data class UploadedFileReconcileDiagnostics(
    val objectPrefix: String,
    val inventoryLimit: Int,
    val inventoryObjectCount: Int,
    val inventoryAvailable: Boolean = true,
    val inventoryTruncated: Boolean,
    val bucketOnlyObjectCount: Int,
    val sampleBucketOnlyObjectKeys: List<String>,
    val dbOnlyMissingObjectCount: Int,
    val sampleDbOnlyObjectKeys: List<String>,
    val longLivedPendingDeleteCount: Long,
    val sampleLongLivedPendingDeleteObjectKeys: List<String>,
    val repairMode: String = "dry-run",
)

data class ProfileImageHistoryDto(
    val id: Long,
    val imageUrl: String,
    val objectKey: String,
    val contentType: String,
    val fileSize: Long,
    val status: UploadedFileStatus,
    @get:JsonProperty("isCurrent")
    val isCurrent: Boolean,
    val createdAt: Instant,
    val modifiedAt: Instant,
)

@Service
class UploadedFileRetentionService(
    private val registrationService: UploadedFileRegistrationService,
    private val postAttachmentRetentionService: PostAttachmentRetentionService,
    private val profileImageRetentionService: ProfileImageRetentionService,
    private val purgeService: UploadedFilePurgeService,
) {
    fun registerTempUpload(
        objectKey: String,
        contentType: String,
        fileSize: Long,
        purpose: UploadedFilePurpose,
    ) {
        registrationService.registerTempUpload(
            objectKey = objectKey,
            contentType = contentType,
            fileSize = fileSize,
            purpose = purpose,
        )
    }

    fun registerTempUploadWithCompensation(
        objectKey: String,
        contentType: String,
        fileSize: Long,
        purpose: UploadedFilePurpose,
    ) {
        registrationService.registerTempUploadWithCompensation(
            objectKey = objectKey,
            contentType = contentType,
            fileSize = fileSize,
            purpose = purpose,
        )
    }

    fun syncPostContent(
        postId: Long,
        previousContent: String?,
        currentContent: String,
    ) {
        postAttachmentRetentionService.syncPostContent(
            postId = postId,
            previousContent = previousContent,
            currentContent = currentContent,
        )
    }

    fun scheduleDeletedPostAttachments(content: String) {
        postAttachmentRetentionService.scheduleDeletedPostAttachments(content)
    }

    fun restoreDeletedPostAttachments(
        postId: Long,
        content: String,
    ) {
        postAttachmentRetentionService.restoreDeletedPostAttachments(
            postId = postId,
            content = content,
        )
    }

    fun syncProfileImage(
        memberId: Long,
        previousProfileImgUrl: String?,
        currentProfileImgUrl: String?,
    ) {
        profileImageRetentionService.syncProfileImage(
            memberId = memberId,
            previousProfileImgUrl = previousProfileImgUrl,
            currentProfileImgUrl = currentProfileImgUrl,
        )
    }

    fun listProfileImages(
        memberId: Long,
        protectedProfileImgUrls: Collection<String?>,
    ): List<ProfileImageHistoryDto> =
        profileImageRetentionService.listProfileImages(
            memberId = memberId,
            protectedProfileImgUrls = protectedProfileImgUrls,
        )

    fun deleteProfileImage(
        memberId: Long,
        fileId: Long,
        protectedProfileImgUrls: Collection<String?>,
    ) {
        profileImageRetentionService.deleteProfileImage(
            memberId = memberId,
            fileId = fileId,
            protectedProfileImgUrls = protectedProfileImgUrls,
        )
    }

    fun purgeExpiredFiles(limit: Int) {
        purgeService.purgeExpiredFiles(limit)
    }

    fun diagnoseCleanup(sampleSize: Int = 5): UploadedFileCleanupDiagnostics = purgeService.diagnoseCleanup(sampleSize)
}
