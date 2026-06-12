package com.back.global.storage.application.port.output

import java.io.InputStream

interface CloudStoragePort {
    data class UploadRequest(
        val objectKey: String,
        val bytes: ByteArray,
        val contentType: String,
        val originalFilename: String,
    )

    data class UploadResult(
        val objectKey: String,
        val checksumSha256: String?,
    )

    data class StoredObject(
        val inputStream: InputStream,
        val contentType: String,
        val contentLength: Long?,
        val originalFilename: String?,
    )

    fun upload(request: UploadRequest): UploadResult

    fun open(objectKey: String): StoredObject?

    fun delete(objectKey: String)
}
