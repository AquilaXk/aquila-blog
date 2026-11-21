package com.back.boundedContexts.post.model

import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType.SEQUENCE
import jakarta.persistence.Id
import jakarta.persistence.Index
import jakarta.persistence.SequenceGenerator
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint

@Entity
@Table(
    name = "post_image_references",
    uniqueConstraints = [
        UniqueConstraint(name = "uk_post_image_references_post_key", columnNames = ["post_id", "object_key"]),
    ],
    indexes = [
        Index(name = "idx_post_image_references_post_id", columnList = "post_id"),
        Index(name = "idx_post_image_references_object_key", columnList = "object_key"),
    ],
)
class PostImageReference(
    @field:Id
    @field:SequenceGenerator(name = "post_image_references_seq_gen", sequenceName = "post_image_references_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "post_image_references_seq_gen")
    override val id: Long = 0,
    @field:Column(name = "post_id", nullable = false)
    val postId: Long,
    @field:Column(name = "object_key", nullable = false, length = 1000)
    val objectKey: String,
    @field:Column(name = "uploaded_file_id")
    val uploadedFileId: Long? = null,
) : BaseTime(id)
