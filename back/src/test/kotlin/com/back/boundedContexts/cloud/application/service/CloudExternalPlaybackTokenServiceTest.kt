package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.application.port.output.CloudExternalPlaybackTokenRepositoryPort
import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.model.CloudExternalPlaybackToken
import com.back.boundedContexts.cloud.model.CloudExternalPlaybackTokenPurpose
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.global.exception.application.AppException
import com.back.global.storage.application.port.output.CloudStoragePort
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@DisplayName("CloudExternalPlaybackTokenService 테스트")
class CloudExternalPlaybackTokenServiceTest {
    private val clock = Clock.fixed(Instant.parse("2026-06-26T12:00:00Z"), ZoneOffset.UTC)
    private val files = FakeCloudFileRepository()
    private val tokens = FakeCloudExternalPlaybackTokenRepository()
    private val storage = FakeCloudStoragePort()
    private val service =
        CloudExternalPlaybackTokenService(
            cloudFileRepository = files,
            cloudExternalPlaybackTokenRepository = tokens,
            cloudStoragePort = storage,
            clock = clock,
        )

    @Test
    @DisplayName("기본 clock으로 service를 생성할 수 있다")
    fun createsServiceWithDefaultClock() {
        val defaultClockService =
            CloudExternalPlaybackTokenService(
                cloudFileRepository = files,
                cloudExternalPlaybackTokenRepository = tokens,
                cloudStoragePort = storage,
            )

        assertThat(defaultClockService).isNotNull()
    }

    @Test
    @DisplayName("관리자 본인 동영상 파일에 대해 5분 TTL raw token을 반환하고 hash만 저장한다")
    fun issueStoresHashOnly() {
        files.savedFiles += videoFile(id = 12L, ownerMemberId = 7L)

        val issued = service.issue(ownerMemberId = 7L, fileId = 12L)

        assertThat(issued.fileId).isEqualTo(12L)
        assertThat(issued.token).isNotBlank()
        assertThat(issued.expiresAt).isEqualTo(Instant.parse("2026-06-26T12:05:00Z"))
        assertThat(issued.contentPath)
            .startsWith("/system/api/v1/adm/cloud/files/12/external-content?token=")
        assertThat(tokens.savedTokens).hasSize(1)
        assertThat(tokens.savedTokens.single().tokenHash).isNotEqualTo(issued.token)
        assertThat(tokens.savedTokens.single().tokenHash).hasSize(64)
        assertThat(tokens.savedTokens.single().fileId).isEqualTo(12L)
        assertThat(tokens.savedTokens.single().memberId).isEqualTo(7L)
        assertThat(tokens.savedTokens.single().purpose).isEqualTo(CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK)
    }

    @Test
    @DisplayName("외부 재생 token은 비디오가 아닌 파일에는 발급하지 않는다")
    fun issueRejectsNonVideoFile() {
        files.savedFiles += documentFile(id = 12L, ownerMemberId = 7L)

        assertThatThrownBy { service.issue(ownerMemberId = 7L, fileId = 12L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("동영상 파일만 외부 재생할 수 있습니다.")

        assertThat(tokens.savedTokens).isEmpty()
    }

    @Test
    @DisplayName("외부 재생 token은 존재하지 않는 파일에는 발급하지 않는다")
    fun issueRejectsMissingFile() {
        assertThatThrownBy { service.issue(ownerMemberId = 7L, fileId = 12L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("클라우드 파일을 찾을 수 없습니다.")

        assertThat(tokens.savedTokens).isEmpty()
    }

    @Test
    @DisplayName("token으로 파일 metadata와 full content를 조회한다")
    fun tokenReadsMetadataAndFullContent() {
        val file = videoFile(id = 12L, ownerMemberId = 7L)
        files.savedFiles += file
        val issued = service.issue(ownerMemberId = 7L, fileId = 12L)
        storage.objects[file.objectKey] =
            CloudStoragePort.StoredObject(
                inputStream = ByteArrayInputStream("0123456789".toByteArray()),
                contentType = "video/mp4",
                contentLength = 10L,
                originalFilename = "demo.mp4",
            )

        val metadata = service.getFile(token = issued.token, fileId = 12L)
        val content = service.openContent(token = issued.token, fileId = 12L)

        assertThat(metadata.id).isEqualTo(12L)
        assertThat(content.file.id).isEqualTo(12L)
        assertThat(content.storedObject.contentLength).isEqualTo(10L)
        assertThat(storage.openedObjects).containsExactly(file.objectKey)
    }

    @Test
    @DisplayName("token은 TTL 안에서 여러 Range 요청을 허용하고 저장소 range read를 사용한다")
    fun tokenAllowsMultipleRangeRequestsBeforeExpiry() {
        val file = videoFile(id = 12L, ownerMemberId = 7L)
        files.savedFiles += file
        val issued = service.issue(ownerMemberId = 7L, fileId = 12L)
        storage.objects[file.objectKey] =
            CloudStoragePort.StoredObject(
                inputStream = ByteArrayInputStream("0123456789".toByteArray()),
                contentType = "video/mp4",
                contentLength = 10L,
                originalFilename = "demo.mp4",
            )

        val first = service.openContentRange(token = issued.token, fileId = 12L, range = 0L..4L)
        val second = service.openContentRange(token = issued.token, fileId = 12L, range = 5L..9L)

        assertThat(first.file.id).isEqualTo(12L)
        assertThat(second.file.id).isEqualTo(12L)
        assertThat(storage.openedRanges).containsExactly(
            file.objectKey to (0L..4L),
            file.objectKey to (5L..9L),
        )
    }

    @Test
    @DisplayName("blank token은 storage 접근 전에 거절한다")
    fun blankTokenIsRejectedBeforeStorageAccess() {
        assertThatThrownBy { service.getFile(token = "   ", fileId = 12L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("외부 재생 token이 올바르지 않거나 만료되었습니다.")

        assertThat(storage.openedObjects).isEmpty()
        assertThat(storage.openedRanges).isEmpty()
    }

    @Test
    @DisplayName("만료된 token은 storage 접근 전에 거절한다")
    fun expiredTokenIsRejectedBeforeStorageAccess() {
        val file = videoFile(id = 12L, ownerMemberId = 7L)
        files.savedFiles += file
        val expiredToken = "expired-token"
        tokens.savedTokens +=
            CloudExternalPlaybackToken.create(
                tokenHash = CloudExternalPlaybackTokenService.hashToken(expiredToken),
                fileId = 12L,
                memberId = 7L,
                purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                expiresAt = Instant.parse("2026-06-26T11:59:59Z"),
            )

        assertThatThrownBy { service.openContentRange(token = expiredToken, fileId = 12L, range = 0L..4L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("외부 재생 token이 올바르지 않거나 만료되었습니다.")

        assertThat(storage.openedRanges).isEmpty()
    }

    @Test
    @DisplayName("token이 유효해도 저장소 객체가 없으면 404를 반환한다")
    fun validTokenRejectsMissingStoredObject() {
        val file = videoFile(id = 12L, ownerMemberId = 7L)
        files.savedFiles += file
        val issued = service.issue(ownerMemberId = 7L, fileId = 12L)

        assertThatThrownBy { service.openContent(token = issued.token, fileId = 12L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("클라우드 파일을 찾을 수 없습니다.")
        assertThatThrownBy { service.openContentRange(token = issued.token, fileId = 12L, range = 0L..4L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("클라우드 파일을 찾을 수 없습니다.")

        assertThat(storage.openedObjects).containsExactly(file.objectKey)
        assertThat(storage.openedRanges).containsExactly(file.objectKey to (0L..4L))
    }

    private fun videoFile(
        id: Long,
        ownerMemberId: Long,
    ): CloudFile =
        CloudFile.create(
            id = id,
            ownerMemberId = ownerMemberId,
            objectKey = "cloud/$ownerMemberId/video/demo.mp4",
            originalFilename = "demo.mp4",
            contentType = "video/mp4",
            byteSize = 10L,
            mediaKind = CloudFileMediaKind.VIDEO,
            folderPath = "video",
            checksumSha256 = "abc",
        )

    private fun documentFile(
        id: Long,
        ownerMemberId: Long,
    ): CloudFile =
        CloudFile.create(
            id = id,
            ownerMemberId = ownerMemberId,
            objectKey = "cloud/$ownerMemberId/docs/manual.pdf",
            originalFilename = "manual.pdf",
            contentType = "application/pdf",
            byteSize = 10L,
            mediaKind = CloudFileMediaKind.DOCUMENT,
            folderPath = "docs",
            checksumSha256 = "abc",
        )

    private class FakeCloudFileRepository : CloudFileRepositoryPort {
        val savedFiles = mutableListOf<CloudFile>()

        override fun save(file: CloudFile): CloudFile {
            savedFiles += file
            return file
        }

        override fun findActiveByOwner(
            ownerMemberId: Long,
            folderPath: String?,
            keyword: String?,
            mediaKind: CloudFileMediaKind?,
        ): List<CloudFile> = savedFiles.filter { it.ownerMemberId == ownerMemberId && it.deletedAt == null }

        override fun findActiveByIdAndOwner(
            id: Long,
            ownerMemberId: Long,
        ): CloudFile? = savedFiles.firstOrNull { it.id == id && it.ownerMemberId == ownerMemberId && it.deletedAt == null }
    }

    private class FakeCloudExternalPlaybackTokenRepository : CloudExternalPlaybackTokenRepositoryPort {
        val savedTokens = mutableListOf<CloudExternalPlaybackToken>()

        override fun save(token: CloudExternalPlaybackToken): CloudExternalPlaybackToken {
            savedTokens += token
            return token
        }

        override fun findValid(
            tokenHash: String,
            fileId: Long,
            purpose: CloudExternalPlaybackTokenPurpose,
            now: Instant,
        ): CloudExternalPlaybackToken? =
            savedTokens.firstOrNull {
                it.tokenHash == tokenHash &&
                    it.fileId == fileId &&
                    it.purpose == purpose &&
                    it.expiresAt.isAfter(now)
            }
    }

    private class FakeCloudStoragePort : CloudStoragePort {
        val openedObjects = mutableListOf<String>()
        val openedRanges = mutableListOf<Pair<String, LongRange>>()
        val objects = mutableMapOf<String, CloudStoragePort.StoredObject>()

        override fun upload(request: CloudStoragePort.UploadRequest): CloudStoragePort.UploadResult =
            CloudStoragePort.UploadResult(request.objectKey, "unused")

        override fun initiateMultipartUpload(
            request: CloudStoragePort.MultipartUploadInitRequest,
        ): CloudStoragePort.MultipartUploadInitResult = CloudStoragePort.MultipartUploadInitResult(request.objectKey, "unused")

        override fun uploadMultipartPart(
            request: CloudStoragePort.MultipartUploadPartRequest,
        ): CloudStoragePort.MultipartUploadPartResult = CloudStoragePort.MultipartUploadPartResult(request.partNumber, "unused")

        override fun completeMultipartUpload(request: CloudStoragePort.MultipartUploadCompleteRequest) = Unit

        override fun abortMultipartUpload(request: CloudStoragePort.MultipartUploadAbortRequest) = Unit

        override fun open(objectKey: String): CloudStoragePort.StoredObject? {
            openedObjects += objectKey
            return objects[objectKey]
        }

        override fun openRange(
            objectKey: String,
            range: LongRange,
        ): CloudStoragePort.StoredObject? {
            openedRanges += objectKey to range
            return objects[objectKey]
        }

        override fun delete(objectKey: String) = Unit
    }
}
