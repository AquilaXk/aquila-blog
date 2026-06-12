package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
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

@DisplayName("관리자 클라우드 파일 서비스 테스트")
class CloudFileServiceTest {
    private val repository = FakeCloudFileRepository()
    private val storage = FakeCloudStoragePort()
    private val service =
        CloudFileService(
            cloudFileRepository = repository,
            cloudStoragePort = storage,
            clock = Clock.fixed(Instant.parse("2026-06-12T00:00:00Z"), ZoneOffset.UTC),
        )

    @Test
    @DisplayName("업로드 시 ownerMemberId와 cloud prefix를 metadata에 고정한다")
    fun `upload는 ownerMemberId와 cloud prefix를 metadata에 고정한다`() {
        val result =
            service.upload(
                ownerMemberId = 7L,
                originalFilename = "manual.pdf",
                contentType = "application/pdf",
                bytes = "%PDF-1.7".toByteArray(),
                folderPath = "docs",
            )

        assertThat(result.ownerMemberId).isEqualTo(7L)
        assertThat(result.originalFilename).isEqualTo("manual.pdf")
        assertThat(result.mediaKind).isEqualTo(CloudFileMediaKind.DOCUMENT)
        assertThat(result.folderPath).isEqualTo("docs")
        assertThat(repository.savedFiles.single().objectKey).startsWith("cloud/7/docs/")
        assertThat(storage.uploaded.single().objectKey).isEqualTo(repository.savedFiles.single().objectKey)
    }

    @Test
    @DisplayName("업로드 시 folder path traversal을 차단한다")
    fun `upload는 folder path traversal을 차단한다`() {
        assertThatThrownBy {
            service.upload(
                ownerMemberId = 7L,
                originalFilename = "secret.pdf",
                contentType = "application/pdf",
                bytes = "%PDF-1.7".toByteArray(),
                folderPath = "../private",
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("유효하지 않은 폴더 경로")

        assertThat(storage.uploaded).isEmpty()
        assertThat(repository.savedFiles).isEmpty()
    }

    @Test
    @DisplayName("업로드 시 파일 내용과 선언 content type이 다르면 차단한다")
    fun `upload는 content type spoofing을 차단한다`() {
        assertThatThrownBy {
            service.upload(
                ownerMemberId = 7L,
                originalFilename = "fake.png",
                contentType = "image/png",
                bytes = "%PDF-1.7".toByteArray(),
                folderPath = "docs",
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("콘텐츠 타입이 일치하지 않습니다")

        assertThat(storage.uploaded).isEmpty()
        assertThat(repository.savedFiles).isEmpty()
    }

    @Test
    @DisplayName("content 조회 시 owner match 없이는 저장소 stream을 열지 않는다")
    fun `content 조회는 owner match 없이는 저장소를 열지 않는다`() {
        val saved =
            repository.save(
                CloudFile.create(
                    ownerMemberId = 7L,
                    objectKey = "cloud/7/docs/file.pdf",
                    originalFilename = "file.pdf",
                    contentType = "application/pdf",
                    byteSize = 9L,
                    mediaKind = CloudFileMediaKind.DOCUMENT,
                    folderPath = "docs",
                    checksumSha256 = null,
                ),
            )

        assertThatThrownBy {
            service.openContent(ownerMemberId = 8L, fileId = saved.id)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("파일을 찾을 수 없습니다")

        assertThat(storage.openedObjectKeys).isEmpty()
    }

    @Test
    @DisplayName("Range content 조회는 owner match 뒤에만 저장소 stream을 반환한다")
    fun `Range content 조회는 owner match 뒤에만 저장소 stream을 반환한다`() {
        val saved =
            repository.save(
                CloudFile.create(
                    ownerMemberId = 7L,
                    objectKey = "cloud/7/video/demo.mp4",
                    originalFilename = "demo.mp4",
                    contentType = "video/mp4",
                    byteSize = 10L,
                    mediaKind = CloudFileMediaKind.VIDEO,
                    folderPath = "video",
                    checksumSha256 = "abc",
                ),
            )
        storage.objects[saved.objectKey] =
            CloudStoragePort.StoredObject(
                inputStream = ByteArrayInputStream("0123456789".toByteArray()),
                contentType = "video/mp4",
                contentLength = 10L,
                originalFilename = "demo.mp4",
            )

        val content = service.openContent(ownerMemberId = 7L, fileId = saved.id)

        assertThat(content.file.id).isEqualTo(saved.id)
        assertThat(content.storedObject.contentType).isEqualTo("video/mp4")
        assertThat(storage.openedObjectKeys).containsExactly(saved.objectKey)
    }

    @Test
    @DisplayName("delete 시 owner mismatch이면 metadata와 object를 삭제하지 않는다")
    fun `delete는 owner mismatch에서 metadata와 object를 삭제하지 않는다`() {
        val saved =
            repository.save(
                CloudFile.create(
                    ownerMemberId = 7L,
                    objectKey = "cloud/7/docs/file.pdf",
                    originalFilename = "file.pdf",
                    contentType = "application/pdf",
                    byteSize = 9L,
                    mediaKind = CloudFileMediaKind.DOCUMENT,
                    folderPath = "docs",
                    checksumSha256 = null,
                ),
            )

        assertThatThrownBy {
            service.delete(ownerMemberId = 8L, fileId = saved.id)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("파일을 찾을 수 없습니다")

        assertThat(repository.findActiveByIdAndOwner(saved.id, 7L)).isNotNull
        assertThat(storage.deletedObjectKeys).isEmpty()
    }

    private class FakeCloudFileRepository : CloudFileRepositoryPort {
        val savedFiles = mutableListOf<CloudFile>()
        private var nextId = 1L

        override fun save(file: CloudFile): CloudFile {
            val stored =
                if (file.id == 0L) {
                    CloudFile.create(
                        id = nextId++,
                        ownerMemberId = file.ownerMemberId,
                        objectKey = file.objectKey,
                        originalFilename = file.originalFilename,
                        contentType = file.contentType,
                        byteSize = file.byteSize,
                        mediaKind = file.mediaKind,
                        folderPath = file.folderPath,
                        checksumSha256 = file.checksumSha256,
                    )
                } else {
                    file
                }
            savedFiles.removeIf { it.id == stored.id }
            savedFiles += stored
            return stored
        }

        override fun findActiveByOwner(
            ownerMemberId: Long,
            folderPath: String?,
            keyword: String?,
            mediaKind: CloudFileMediaKind?,
        ): List<CloudFile> =
            savedFiles.filter {
                it.ownerMemberId == ownerMemberId &&
                    it.deletedAt == null &&
                    (folderPath == null || it.folderPath == folderPath) &&
                    (keyword.isNullOrBlank() || it.originalFilename.contains(keyword, ignoreCase = true)) &&
                    (mediaKind == null || it.mediaKind == mediaKind)
            }

        override fun findActiveByIdAndOwner(
            id: Long,
            ownerMemberId: Long,
        ): CloudFile? =
            savedFiles.firstOrNull {
                it.id == id &&
                    it.ownerMemberId == ownerMemberId &&
                    it.deletedAt == null
            }
    }

    private class FakeCloudStoragePort : CloudStoragePort {
        val uploaded = mutableListOf<CloudStoragePort.UploadRequest>()
        val openedObjectKeys = mutableListOf<String>()
        val deletedObjectKeys = mutableListOf<String>()
        val objects = mutableMapOf<String, CloudStoragePort.StoredObject>()

        override fun upload(request: CloudStoragePort.UploadRequest): CloudStoragePort.UploadResult {
            uploaded += request
            return CloudStoragePort.UploadResult(
                objectKey = request.objectKey,
                checksumSha256 = "test-checksum",
            )
        }

        override fun open(objectKey: String): CloudStoragePort.StoredObject? {
            openedObjectKeys += objectKey
            return objects[objectKey]
        }

        override fun delete(objectKey: String) {
            deletedObjectKeys += objectKey
        }
    }
}
