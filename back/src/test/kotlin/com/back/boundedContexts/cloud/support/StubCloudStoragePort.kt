package com.back.boundedContexts.cloud.support

import com.back.global.storage.application.port.output.CloudStoragePort
import java.io.ByteArrayInputStream
import java.io.InputStream

/** Shared CloudStoragePort stub with no-op defaults for unused multipart/inventory APIs. */
open class StubCloudStoragePort : CloudStoragePort {
    override fun upload(request: CloudStoragePort.UploadRequest): CloudStoragePort.UploadResult =
        CloudStoragePort.UploadResult(request.objectKey, "checksum")

    override fun initiateMultipartUpload(
        request: CloudStoragePort.MultipartUploadInitRequest,
    ): CloudStoragePort.MultipartUploadInitResult = CloudStoragePort.MultipartUploadInitResult(request.objectKey, "upload-1")

    override fun uploadMultipartPart(request: CloudStoragePort.MultipartUploadPartRequest): CloudStoragePort.MultipartUploadPartResult =
        CloudStoragePort.MultipartUploadPartResult(request.partNumber, "etag")

    override fun completeMultipartUpload(request: CloudStoragePort.MultipartUploadCompleteRequest) = Unit

    override fun abortMultipartUpload(request: CloudStoragePort.MultipartUploadAbortRequest) = Unit

    override fun head(objectKey: String): CloudStoragePort.ObjectHead? = null

    override fun listObjects(
        prefix: String,
        limit: Int,
    ): CloudStoragePort.StoredObjectListing = CloudStoragePort.StoredObjectListing(objects = emptyList(), isTruncated = false)

    override fun open(objectKey: String): CloudStoragePort.StoredObject? = null

    override fun openRange(
        objectKey: String,
        range: LongRange,
    ): CloudStoragePort.StoredObject? = null

    override fun delete(objectKey: String) = Unit

    protected fun emptyStream(): InputStream = ByteArrayInputStream(ByteArray(0))
}
