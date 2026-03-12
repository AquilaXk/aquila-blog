package com.back.global.storage.domain

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
import org.hibernate.annotations.DynamicUpdate
import java.time.Instant

enum class UploadedFileStatus {
    TEMP,
    ACTIVE,
    PENDING_DELETE,
    DELETED,
}

enum class UploadedFilePurpose {
    POST_IMAGE,
    PROFILE_IMAGE,
}

enum class UploadedFileOwnerType {
    POST,
    MEMBER_PROFILE,
}

enum class UploadedFileRetentionReason {
    TEMP_UPLOAD,
    REPLACED_PROFILE_IMAGE,
    DETACHED_POST_ATTACHMENT,
    DELETED_POST_ATTACHMENT,
}

@Entity
@DynamicUpdate
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS uploaded_file_idx_status_purge_after
    ON uploaded_file (status, purge_after ASC)
    """,
)
class UploadedFile(
    @field:Id
    @field:SequenceGenerator(name = "uploaded_file_seq_gen", sequenceName = "uploaded_file_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "uploaded_file_seq_gen")
    override val id: Int = 0,
    @field:Column(nullable = false, unique = true, length = 1000)
    val objectKey: String,
    @field:Column(nullable = false, length = 120)
    var bucket: String,
    @field:Column(nullable = false, length = 120)
    var contentType: String,
    @field:Column(nullable = false)
    var fileSize: Long,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 40)
    var purpose: UploadedFilePurpose = UploadedFilePurpose.POST_IMAGE,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 40)
    var status: UploadedFileStatus = UploadedFileStatus.TEMP,
    @field:Enumerated(EnumType.STRING)
    @field:Column(length = 40)
    var ownerType: UploadedFileOwnerType? = null,
    @field:Column
    var ownerId: Int? = null,
    @field:Enumerated(EnumType.STRING)
    @field:Column(length = 40)
    var retentionReason: UploadedFileRetentionReason? = UploadedFileRetentionReason.TEMP_UPLOAD,
    @field:Column
    var purgeAfter: Instant? = null,
    @field:Column
    var deletedAt: Instant? = null,
) : BaseTime(id) {
    fun markTemporary(
        purpose: UploadedFilePurpose,
        purgeAfter: Instant,
    ) {
        this.purpose = purpose
        status = UploadedFileStatus.TEMP
        ownerType = null
        ownerId = null
        retentionReason = UploadedFileRetentionReason.TEMP_UPLOAD
        this.purgeAfter = purgeAfter
        deletedAt = null
    }

    fun attachToPost(postId: Int) {
        purpose = UploadedFilePurpose.POST_IMAGE
        status = UploadedFileStatus.ACTIVE
        ownerType = UploadedFileOwnerType.POST
        ownerId = postId
        retentionReason = null
        purgeAfter = null
        deletedAt = null
    }

    fun attachToMemberProfile(memberId: Int) {
        purpose = UploadedFilePurpose.PROFILE_IMAGE
        status = UploadedFileStatus.ACTIVE
        ownerType = UploadedFileOwnerType.MEMBER_PROFILE
        ownerId = memberId
        retentionReason = null
        purgeAfter = null
        deletedAt = null
    }

    fun scheduleDeletion(
        reason: UploadedFileRetentionReason,
        purgeAfter: Instant,
    ) {
        status = UploadedFileStatus.PENDING_DELETE
        retentionReason = reason
        this.purgeAfter = purgeAfter
    }

    fun restoreActive() {
        status = UploadedFileStatus.ACTIVE
        retentionReason = null
        purgeAfter = null
        deletedAt = null
    }

    fun markDeleted() {
        status = UploadedFileStatus.DELETED
        retentionReason = null
        purgeAfter = null
        deletedAt = Instant.now()
        ownerType = null
        ownerId = null
    }
}
