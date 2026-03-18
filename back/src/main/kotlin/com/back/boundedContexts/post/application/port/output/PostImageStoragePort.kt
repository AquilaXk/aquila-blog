package com.back.boundedContexts.post.application.port.output

import java.io.InputStream

/**
 * `PostImageStoragePort` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface PostImageStoragePort {
    data class UploadImageRequest(
        val bytes: ByteArray,
        val contentType: String?,
        val originalFilename: String?,
    )

    data class StoredImage(
        val inputStream: InputStream,
        val contentType: String,
        val contentLength: Long?,
    )

    fun uploadPostImage(request: UploadImageRequest): String

    fun getPostImage(objectKey: String): StoredImage?

    fun deletePostImage(objectKey: String)
}
