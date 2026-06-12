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
import org.hibernate.annotations.DynamicUpdate
import java.time.Instant

enum class CloudFileMediaKind {
    DOCUMENT,
    PHOTO,
    VIDEO,
}

@Entity
@DynamicUpdate
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS cloud_file_idx_owner_folder_created_active
    ON cloud_file (owner_member_id, folder_path, created_at DESC, id DESC)
    WHERE deleted_at IS NULL
    """,
)
class CloudFile(
    @field:Id
    @field:SequenceGenerator(name = "cloud_file_seq_gen", sequenceName = "cloud_file_seq", allocationSize = 1)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "cloud_file_seq_gen")
    override val id: Long = 0,
    @field:Column(nullable = false)
    val ownerMemberId: Long,
    @field:Column(nullable = false, unique = true, length = 1000)
    val objectKey: String,
    @field:Column(nullable = false, length = 255)
    val originalFilename: String,
    @field:Column(nullable = false, length = 120)
    val contentType: String,
    @field:Column(nullable = false)
    val byteSize: Long,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 40)
    val mediaKind: CloudFileMediaKind,
    @field:Column(nullable = false, length = 500)
    val folderPath: String = "",
    @field:Column(length = 128)
    val checksumSha256: String? = null,
    @field:Column
    var deletedAt: Instant? = null,
) : BaseTime(id) {
    fun markDeleted(now: Instant) {
        deletedAt = now
    }

    companion object {
        fun create(
            id: Long = 0,
            ownerMemberId: Long,
            objectKey: String,
            originalFilename: String,
            contentType: String,
            byteSize: Long,
            mediaKind: CloudFileMediaKind,
            folderPath: String,
            checksumSha256: String?,
        ): CloudFile =
            CloudFile(
                id = id,
                ownerMemberId = ownerMemberId,
                objectKey = objectKey,
                originalFilename = originalFilename,
                contentType = contentType,
                byteSize = byteSize,
                mediaKind = mediaKind,
                folderPath = folderPath,
                checksumSha256 = checksumSha256,
            )
    }
}
