package com.back.boundedContexts.post.application.port.out

import org.springframework.web.multipart.MultipartFile

interface PostImageStoragePort {
    data class StoredImage(
        val bytes: ByteArray,
        val contentType: String,
    )

    fun uploadPostImage(file: MultipartFile): String

    fun getPostImage(objectKey: String): StoredImage?

    fun deletePostImage(objectKey: String)
}
