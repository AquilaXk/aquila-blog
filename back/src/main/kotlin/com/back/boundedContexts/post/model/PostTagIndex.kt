package com.back.boundedContexts.post.model

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.IdClass
import jakarta.persistence.Table
import java.io.Serializable

@Entity
@Table(name = "post_tag_index")
@IdClass(PostTagIndexId::class)
class PostTagIndex(
    @field:Id
    @field:Column(name = "post_id", nullable = false)
    val postId: Long = 0,
    @field:Id
    @field:Column(nullable = false, length = 80)
    val tag: String = "",
)

data class PostTagIndexId(
    val postId: Long = 0,
    val tag: String = "",
) : Serializable
