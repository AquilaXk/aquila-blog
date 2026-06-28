package com.back.boundedContexts.post.application.port.output

import java.io.InputStream

/**
 * 게시글/프로필 이미지와 첨부파일을 외부 object storage에 저장하는 포트입니다.
 *
 * 업로드 요청은 `MultipartFile.bytes`의 전체 메모리 복사를 피하기 위해 stream과
 * Spring multipart metadata의 `contentLength`를 함께 전달합니다.
 */
interface PostImageStoragePort {
    data class UploadImageRequest(
        val inputStream: InputStream,
        val contentLength: Long,
        val contentType: String?,
        val originalFilename: String?,
    )

    data class UploadFileRequest(
        val inputStream: InputStream,
        val contentLength: Long,
        val contentType: String?,
        val originalFilename: String?,
    )

    data class StoredObject(
        val inputStream: InputStream,
        val contentType: String,
        val contentLength: Long?,
        val originalFilename: String? = null,
    )

    data class StoredObjectSummary(
        val objectKey: String,
        val size: Long,
    )

    data class StoredObjectListing(
        val objects: List<StoredObjectSummary>,
        val isTruncated: Boolean,
    )

    fun uploadPostImage(request: UploadImageRequest): String

    fun uploadPostFile(request: UploadFileRequest): String

    fun getPostImage(objectKey: String): StoredObject?

    fun getPostFile(objectKey: String): StoredObject?

    fun deletePostImage(objectKey: String)

    fun deletePostFile(objectKey: String)

    /**
     * Returns at most [limit] objects under [prefix], ordered stably by `objectKey`.
     * `isTruncated=true` means additional matching objects may exist beyond this result.
     */
    fun listObjects(
        prefix: String,
        limit: Int,
    ): StoredObjectListing
}
