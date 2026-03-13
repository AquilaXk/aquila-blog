package com.back.boundedContexts.post.application.port.out

import org.springframework.web.multipart.MultipartFile
import java.io.InputStream

interface PostImageStoragePort {
    data class StoredImage(
        val inputStream: InputStream,
        val contentType: String,
        val contentLength: Long?,
    )

    fun uploadPostImage(file: MultipartFile): String

    fun getPostImage(objectKey: String): StoredImage?

    fun deletePostImage(objectKey: String)
}
