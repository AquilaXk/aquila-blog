package com.back.boundedContexts.post.application.port.output

interface PostImageReferenceRepositoryPort {
    fun existsByPostIdAndObjectKey(
        postId: Long,
        objectKey: String,
    ): Boolean

    fun existsByObjectKey(objectKey: String): Boolean

    fun replacePostImageReferences(
        postId: Long,
        objectKeys: Collection<String>,
    )

    fun deletePostImageReferences(postId: Long)

    fun findObjectKeysByPostId(postId: Long): List<String>
}
