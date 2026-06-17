package com.back.global.storage.application.port.output

import java.io.InputStream

interface CloudStoragePort {
    class UploadRequest(
        val objectKey: String,
        val bytes: ByteArray,
        val contentType: String,
        val originalFilename: String,
    ) {
        override fun equals(other: Any?): Boolean =
            this === other ||
                (
                    other is UploadRequest &&
                        objectKey == other.objectKey &&
                        bytes.contentEquals(other.bytes) &&
                        contentType == other.contentType &&
                        originalFilename == other.originalFilename
                )

        override fun hashCode(): Int {
            var result = objectKey.hashCode()
            result = 31 * result + bytes.contentHashCode()
            result = 31 * result + contentType.hashCode()
            result = 31 * result + originalFilename.hashCode()
            return result
        }

        override fun toString(): String =
            "UploadRequest(" +
                "objectKey=$objectKey, " +
                "bytes=${bytes.size} bytes, " +
                "contentType=$contentType, " +
                "originalFilename=$originalFilename" +
                ")"
    }

    data class UploadResult(
        val objectKey: String,
        val checksumSha256: String,
    )

    data class MultipartUploadInitRequest(
        val objectKey: String,
        val contentType: String,
        val originalFilename: String,
    )

    data class MultipartUploadInitResult(
        val objectKey: String,
        val uploadId: String,
    )

    class MultipartUploadPartRequest(
        val objectKey: String,
        val uploadId: String,
        val partNumber: Int,
        val bytes: ByteArray,
    ) {
        override fun equals(other: Any?): Boolean =
            this === other ||
                (
                    other is MultipartUploadPartRequest &&
                        objectKey == other.objectKey &&
                        uploadId == other.uploadId &&
                        partNumber == other.partNumber &&
                        bytes.contentEquals(other.bytes)
                )

        override fun hashCode(): Int {
            var result = objectKey.hashCode()
            result = 31 * result + uploadId.hashCode()
            result = 31 * result + partNumber
            result = 31 * result + bytes.contentHashCode()
            return result
        }
    }

    data class MultipartUploadPartResult(
        val partNumber: Int,
        val eTag: String,
    )

    data class CompletedMultipartUploadPart(
        val partNumber: Int,
        val eTag: String,
    )

    data class MultipartUploadCompleteRequest(
        val objectKey: String,
        val uploadId: String,
        val parts: List<CompletedMultipartUploadPart>,
    )

    data class MultipartUploadAbortRequest(
        val objectKey: String,
        val uploadId: String,
    )

    /**
     * S3 호환 클라이언트가 반환한 네트워크 스트림을 감싼다.
     * 응답을 반환하거나 복사한 호출자는 연결 풀이 고갈되지 않도록 반드시 닫아야 한다.
     */
    data class StoredObject(
        val inputStream: InputStream,
        val contentType: String,
        val contentLength: Long?,
        val originalFilename: String?,
    ) : AutoCloseable {
        override fun close() {
            inputStream.close()
        }
    }

    fun upload(request: UploadRequest): UploadResult

    fun initiateMultipartUpload(request: MultipartUploadInitRequest): MultipartUploadInitResult

    fun uploadMultipartPart(request: MultipartUploadPartRequest): MultipartUploadPartResult

    fun completeMultipartUpload(request: MultipartUploadCompleteRequest)

    fun abortMultipartUpload(request: MultipartUploadAbortRequest)

    fun open(objectKey: String): StoredObject?

    fun delete(objectKey: String)
}
