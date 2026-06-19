package com.back.boundedContexts.cloud.model

import com.back.global.jpa.domain.AfterDDL
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType.SEQUENCE
import jakarta.persistence.Id
import jakarta.persistence.SequenceGenerator
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import org.hibernate.annotations.DynamicUpdate
import java.time.Instant

enum class CloudVideoUploadSessionStatus {
    INITIATING,
    IN_PROGRESS,
    UPLOADING_PART,
    COMPLETING,
    COMPLETED,
    ABORTING,
    CANCELLED,
    EXPIRED,
    FAILED,
}

@Entity
@DynamicUpdate
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS cloud_video_upload_session_idx_owner_status_expires
    ON cloud_video_upload_session (owner_member_id, status, expires_at, id)
    """,
)
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS cloud_video_upload_session_idx_status_expires
    ON cloud_video_upload_session (status, expires_at, id)
    """,
)
class CloudVideoUploadSession(
    @field:Id
    @field:SequenceGenerator(
        name = "cloud_video_upload_session_seq_gen",
        sequenceName = "cloud_video_upload_session_seq",
        allocationSize = 1,
    )
    @field:GeneratedValue(strategy = SEQUENCE, generator = "cloud_video_upload_session_seq_gen")
    override val id: Long = 0,
    @field:Column(nullable = false)
    val ownerMemberId: Long,
    @field:Column(nullable = false, unique = true, length = 1000)
    val objectKey: String,
    @field:Column(length = 512)
    var uploadId: String?,
    @field:Column(nullable = false, length = 255)
    val originalFilename: String,
    @field:Column(nullable = false, length = 120)
    val contentType: String,
    @field:Column(nullable = false)
    val byteSize: Long,
    @field:Column(nullable = false, length = 500)
    val folderPath: String,
    @field:Column(nullable = false)
    val partSizeBytes: Long,
    @field:Column(nullable = false)
    val totalParts: Int,
    @field:Column(nullable = false)
    val expiresAt: Instant,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 40)
    var status: CloudVideoUploadSessionStatus = CloudVideoUploadSessionStatus.IN_PROGRESS,
    @field:Column
    var completedFileId: Long? = null,
    @field:Column(length = 500)
    var failureReason: String? = null,
) : BaseTime(id) {
    fun markInitiated(
        uploadId: String,
        now: Instant,
    ) {
        this.uploadId = uploadId
        status = CloudVideoUploadSessionStatus.IN_PROGRESS
        failureReason = null
        updateModifiedAt(now)
    }

    fun transitionTo(
        nextStatus: CloudVideoUploadSessionStatus,
        now: Instant,
    ) {
        status = nextStatus
        failureReason = null
        updateModifiedAt(now)
    }

    fun complete(
        fileId: Long,
        now: Instant,
    ) {
        status = CloudVideoUploadSessionStatus.COMPLETED
        completedFileId = fileId
        failureReason = null
        updateModifiedAt(now)
    }

    fun cancel(now: Instant) {
        status = CloudVideoUploadSessionStatus.CANCELLED
        failureReason = null
        updateModifiedAt(now)
    }

    fun expire(now: Instant) {
        status = CloudVideoUploadSessionStatus.EXPIRED
        failureReason = null
        updateModifiedAt(now)
    }

    fun fail(
        reason: String,
        now: Instant,
    ) {
        status = CloudVideoUploadSessionStatus.FAILED
        failureReason = reason.take(500)
        updateModifiedAt(now)
    }

    private fun updateModifiedAt(now: Instant) {
        modifiedAt = now
    }
}

@Entity
@Table(
    uniqueConstraints = [
        UniqueConstraint(
            name = "uk_cloud_video_upload_part_session_number",
            columnNames = ["session_id", "part_number"],
        ),
    ],
)
class CloudVideoUploadPart(
    @field:Id
    @field:SequenceGenerator(
        name = "cloud_video_upload_part_seq_gen",
        sequenceName = "cloud_video_upload_part_seq",
        allocationSize = 1,
    )
    @field:GeneratedValue(strategy = SEQUENCE, generator = "cloud_video_upload_part_seq_gen")
    override val id: Long = 0,
    @field:Column(nullable = false)
    val sessionId: Long,
    @field:Column(nullable = false)
    val partNumber: Int,
    @field:Column(nullable = false, length = 255)
    val eTag: String,
    @field:Column(nullable = false)
    val byteSize: Long,
) : BaseTime(id)
