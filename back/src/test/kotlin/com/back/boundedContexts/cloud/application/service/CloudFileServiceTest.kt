package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.global.exception.application.AppException
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

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
    @DisplayName("업로드 시 설정된 최대 크기를 넘으면 storage에 저장하지 않는다")
    fun `upload는 설정된 최대 크기를 넘으면 storage에 저장하지 않는다`() {
        val limitedService =
            CloudFileService(
                cloudFileRepository = repository,
                cloudStoragePort = storage,
                cloudStorageProperties = CloudStorageProperties(maxFileSizeBytes = 5),
                clock = Clock.fixed(Instant.parse("2026-06-12T00:00:00Z"), ZoneOffset.UTC),
            )

        assertThatThrownBy {
            limitedService.upload(
                ownerMemberId = 7L,
                originalFilename = "large.pdf",
                contentType = "application/pdf",
                bytes = "%PDF-1.7".toByteArray(),
                folderPath = "docs",
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("클라우드 파일은")

        assertThat(storage.uploaded).isEmpty()
        assertThat(repository.savedFiles).isEmpty()
    }

    @Test
    @DisplayName("업로드 시 빈 파일과 미지원 파일 형식을 storage 저장 전에 차단한다")
    fun `upload는 빈 파일과 미지원 파일 형식을 storage 저장 전에 차단한다`() {
        assertThatThrownBy {
            service.upload(
                ownerMemberId = 7L,
                originalFilename = "empty.pdf",
                contentType = "application/pdf",
                bytes = byteArrayOf(),
                folderPath = "docs",
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("비어 있습니다")

        assertThatThrownBy {
            service.upload(
                ownerMemberId = 7L,
                originalFilename = "unknown.bin",
                contentType = "application/octet-stream",
                bytes = "plain".toByteArray(),
                folderPath = "docs",
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("지원하지 않는 클라우드 파일 형식")

        assertThat(storage.uploaded).isEmpty()
        assertThat(repository.savedFiles).isEmpty()
    }

    @Test
    @DisplayName("업로드 시 지원하는 문서 사진 동영상 시그니처를 mediaKind로 분류한다")
    fun `upload는 지원하는 문서 사진 동영상 시그니처를 mediaKind로 분류한다`() {
        val cases =
            listOf(
                SignatureCase("alias.jpg", "image/jpg", byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte()), CloudFileMediaKind.PHOTO),
                SignatureCase("photo.png", "image/x-png", PNG_BYTES, CloudFileMediaKind.PHOTO),
                SignatureCase("anim.gif", "image/gif", "GIF89a".toByteArray(), CloudFileMediaKind.PHOTO),
                SignatureCase("asset.webp", "image/x-webp", "RIFFxxxxWEBP".toByteArray(), CloudFileMediaKind.PHOTO),
                SignatureCase("movie.mp4", null, byteArrayOf(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0), CloudFileMediaKind.VIDEO),
                SignatureCase("clip.webm", "video/webm", byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte()), CloudFileMediaKind.VIDEO),
            )

        cases.forEachIndexed { index, case ->
            val result =
                service.upload(
                    ownerMemberId = 7L,
                    originalFilename = "unsafe/${case.filename}\n",
                    contentType = case.contentType,
                    bytes = case.bytes,
                    folderPath = "/media $index/",
                )

            assertThat(result.mediaKind).isEqualTo(case.mediaKind)
            assertThat(result.folderPath).isEqualTo("media $index")
            assertThat(result.originalFilename).doesNotContain("/")
        }

        assertThat(storage.uploaded).hasSize(cases.size)
    }

    @Test
    @DisplayName("업로드 시 파일명이 없으면 기본 파일명과 root folder를 사용한다")
    fun `upload는 파일명이 없으면 기본 파일명과 root folder를 사용한다`() {
        val result =
            service.upload(
                ownerMemberId = 7L,
                originalFilename = null,
                contentType = "application/pdf",
                bytes = "%PDF-1.7".toByteArray(),
                folderPath = null,
            )

        assertThat(result.originalFilename).isEqualTo("cloud-file")
        assertThat(result.folderPath).isEmpty()
        assertThat(repository.savedFiles.single().objectKey).startsWith("cloud/7/2026/06/12/")
    }

    @Test
    @DisplayName("업로드 시 NFD 한글 HWPX 문서는 NFC 파일명으로 저장한다")
    fun `upload는 NFD 한글 HWPX 문서를 NFC 파일명으로 저장한다`() {
        val nfcName = "★2026년 제3회 식약처 공무원(일반직) 경력경쟁채용시험 공고문_게시.hwpx"
        val nfdName = Normalizer.normalize(nfcName, Normalizer.Form.NFD)

        val result =
            service.upload(
                ownerMemberId = 7L,
                originalFilename = nfdName,
                clientOriginalFilename = nfdName,
                contentType = "application/octet-stream",
                bytes = zipBytes(),
                folderPath = null,
            )

        assertThat(result.originalFilename).isEqualTo(nfcName)
        assertThat(result.mediaKind).isEqualTo(CloudFileMediaKind.DOCUMENT)
        assertThat(result.contentType).isEqualTo("application/haansofthwpx")
        assertThat(storage.uploaded.single().originalFilename).isEqualTo(nfcName)
    }

    @Test
    @DisplayName("업로드 시 HWPX 판별은 압축 본문을 풀지 않고 중앙 디렉터리 이름만 확인한다")
    fun `upload는 HWPX 판별 시 중앙 디렉터리 이름만 확인한다`() {
        val result =
            service.upload(
                ownerMemberId = 7L,
                originalFilename = "제출서류_총괄표.hwpx",
                contentType = "application/octet-stream",
                bytes = zipBytesWithLargeLeadingEntry(),
                folderPath = null,
            )

        assertThat(result.mediaKind).isEqualTo(CloudFileMediaKind.DOCUMENT)
        assertThat(result.contentType).isEqualTo("application/haansofthwpx")
        assertThat(result.originalFilename).isEqualTo("제출서류_총괄표.hwpx")
    }

    @Test
    @DisplayName("업로드 시 잘못된 ZIP 헤더 조합은 HWPX 문서로 저장하지 않는다")
    fun `upload는 잘못된 ZIP 헤더 조합을 HWPX 문서로 저장하지 않는다`() {
        assertThatThrownBy {
            service.upload(
                ownerMemberId = 7L,
                originalFilename = "invalid.hwpx",
                contentType = "application/octet-stream",
                bytes = invalidZipBytes(),
                folderPath = null,
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("지원하지 않는 클라우드 파일 형식")

        assertThat(storage.uploaded).isEmpty()
        assertThat(repository.savedFiles).isEmpty()
    }

    @Test
    @DisplayName("업로드 시 중앙 디렉터리가 없는 ZIP 조각은 HWPX 문서로 저장하지 않는다")
    fun `upload는 중앙 디렉터리가 없는 ZIP 조각을 HWPX 문서로 저장하지 않는다`() {
        assertThatThrownBy {
            service.upload(
                ownerMemberId = 7L,
                originalFilename = "truncated.hwpx",
                contentType = "application/octet-stream",
                bytes = truncatedZipBytes(),
                folderPath = null,
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("지원하지 않는 클라우드 파일 형식")

        assertThat(storage.uploaded).isEmpty()
        assertThat(repository.savedFiles).isEmpty()
    }

    @Test
    @DisplayName("업로드 시 일반 ZIP 파일은 HWPX 확장자로 바꿔도 저장하지 않는다")
    fun `upload는 일반 ZIP 파일을 HWPX 문서로 저장하지 않는다`() {
        assertThatThrownBy {
            service.upload(
                ownerMemberId = 7L,
                originalFilename = "renamed.hwpx",
                contentType = "application/octet-stream",
                bytes = genericZipBytes(),
                folderPath = null,
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("지원하지 않는 클라우드 파일 형식")

        assertThat(storage.uploaded).isEmpty()
        assertThat(repository.savedFiles).isEmpty()
    }

    @Test
    @DisplayName("업로드 시 mojibake로 들어온 한글 파일명은 원본 기호까지 UTF-8 기준으로 복구한다")
    fun `upload는 mojibake 한글 파일명을 UTF-8 기준으로 복구한다`() {
        val originalName = "★2026년 제3회 식약처 공무원(일반직) 경력경쟁채용시험 공고문_게시.pdf"
        val mojibakeName = String(originalName.toByteArray(StandardCharsets.UTF_8), StandardCharsets.ISO_8859_1)

        val result =
            service.upload(
                ownerMemberId = 7L,
                originalFilename = mojibakeName,
                contentType = "application/pdf",
                bytes = "%PDF-1.7".toByteArray(),
                folderPath = null,
            )

        assertThat(result.originalFilename).isEqualTo(originalName)
    }

    @Test
    @DisplayName("업로드 시 multipart 파일명이 이미 손상되면 client 파일명을 우선 저장한다")
    fun `upload는 손상된 multipart 파일명 대신 client 파일명을 우선 저장한다`() {
        val clientName = "[첨부1] NCS기반 채용 직무설명자료_2026년 제3회 식약처 공무원(일반직) 경력경쟁채용시험 공고문_게시.pdf"

        val result =
            service.upload(
                ownerMemberId = 7L,
                originalFilename = "______1_ NCS______2026__ __3__ ___________________.pdf",
                clientOriginalFilename = clientName,
                contentType = "application/pdf",
                bytes = "%PDF-1.7".toByteArray(),
                folderPath = null,
            )

        assertThat(result.originalFilename).isEqualTo(clientName)
    }

    @Test
    @DisplayName("업로드 시 보이지 않는 Unicode 제어 서식 문자는 파일명에서 제거한다")
    fun `upload는 보이지 않는 unicode 제어 서식 문자를 제거한다`() {
        val result =
            service.upload(
                ownerMemberId = 7L,
                originalFilename = "계약서\u202Ecod.exe\u0080.pdf",
                contentType = "application/pdf",
                bytes = "%PDF-1.7".toByteArray(),
                folderPath = null,
            )

        assertThat(result.originalFilename).isEqualTo("계약서cod.exe.pdf")
    }

    @Test
    @DisplayName("업로드 시 긴 non-BMP 파일명은 metadata 안전 길이로 자른다")
    fun `upload는 긴 non-BMP 파일명을 metadata 안전 길이로 자른다`() {
        val result =
            service.upload(
                ownerMemberId = 7L,
                originalFilename = "😀".repeat(300) + ".pdf",
                contentType = "application/pdf",
                bytes = "%PDF-1.7".toByteArray(),
                folderPath = null,
            )

        assertThat(metadataEncodedLength(result.originalFilename)).isLessThanOrEqualTo(1024)
        assertThat(result.originalFilename).endsWith(".pdf")
        assertThat(hasUnpairedSurrogate(result.originalFilename)).isFalse()
    }

    @Test
    @DisplayName("업로드 시 과도하게 긴 확장자는 DB 컬럼 길이 안으로 자른다")
    fun `upload는 과도하게 긴 확장자를 db 컬럼 길이 안으로 자른다`() {
        val result =
            service.upload(
                ownerMemberId = 7L,
                originalFilename = "a." + "x".repeat(300),
                contentType = "application/pdf",
                bytes = "%PDF-1.7".toByteArray(),
                folderPath = null,
            )

        assertThat(result.originalFilename).hasSizeLessThanOrEqualTo(255)
        assertThat(metadataEncodedLength(result.originalFilename)).isLessThanOrEqualTo(1024)
        assertThat(result.originalFilename).startsWith("a.")
    }

    @Test
    @DisplayName("목록과 단건 조회는 owner folder keyword mediaKind 조건을 적용한다")
    fun `목록과 단건 조회는 owner folder keyword mediaKind 조건을 적용한다`() {
        repository.assignAuditTimestamps = true
        val manual =
            repository.save(
                cloudFile(
                    ownerMemberId = 7L,
                    objectKey = "cloud/7/docs/manual.pdf",
                    originalFilename = "Manual.pdf",
                    mediaKind = CloudFileMediaKind.DOCUMENT,
                    folderPath = "docs",
                ),
            )
        repository.save(
            cloudFile(
                ownerMemberId = 7L,
                objectKey = "cloud/7/photos/photo.png",
                originalFilename = "photo.png",
                mediaKind = CloudFileMediaKind.PHOTO,
                folderPath = "photos",
            ),
        )

        val files =
            service.listFiles(
                ownerMemberId = 7L,
                folderPath = " docs ",
                keyword = "manual",
                mediaKind = CloudFileMediaKind.DOCUMENT,
            )
        val dto = service.get(ownerMemberId = 7L, fileId = manual.id)
        val allFiles = service.listFiles(ownerMemberId = 7L, folderPath = "", keyword = " ", mediaKind = null)

        assertThat(files).extracting("id").containsExactly(manual.id)
        assertThat(dto.createdAt).isEqualTo(Instant.parse("2026-06-12T00:00:00Z"))
        assertThat(allFiles).hasSize(2)
        assertThatThrownBy {
            service.get(ownerMemberId = 8L, fileId = manual.id)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("파일을 찾을 수 없습니다")
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
    @DisplayName("content 조회 시 metadata는 있지만 object가 없으면 404로 실패한다")
    fun `content 조회는 metadata는 있지만 object가 없으면 실패한다`() {
        val saved =
            repository.save(
                cloudFile(
                    ownerMemberId = 7L,
                    objectKey = "cloud/7/docs/missing.pdf",
                    originalFilename = "missing.pdf",
                    mediaKind = CloudFileMediaKind.DOCUMENT,
                    folderPath = "docs",
                ),
            )

        assertThatThrownBy {
            service.openContent(ownerMemberId = 7L, fileId = saved.id)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("파일을 찾을 수 없습니다")

        assertThat(storage.openedObjectKeys).containsExactly(saved.objectKey)
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
    @DisplayName("delete 시 metadata 삭제 표시 저장 후 object를 삭제한다")
    fun `delete는 metadata 삭제 표시 저장 후 object를 삭제한다`() {
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
        repository.onSave = { file ->
            assertThat(file.deletedAt).isNotNull()
            assertThat(storage.deletedObjectKeys).isEmpty()
        }

        service.delete(ownerMemberId = 7L, fileId = saved.id)

        assertThat(repository.findActiveByIdAndOwner(saved.id, 7L)).isNull()
        assertThat(storage.deletedObjectKeys).containsExactly(saved.objectKey)
    }

    @Test
    @DisplayName("delete 시 transaction commit 이후 object 삭제를 실행한다")
    fun `delete는 transaction commit 이후 object 삭제를 실행한다`() {
        val saved =
            repository.save(
                cloudFile(
                    ownerMemberId = 7L,
                    objectKey = "cloud/7/docs/tx.pdf",
                    originalFilename = "tx.pdf",
                    mediaKind = CloudFileMediaKind.DOCUMENT,
                    folderPath = "docs",
                ),
            )

        TransactionSynchronizationManager.initSynchronization()
        try {
            service.delete(ownerMemberId = 7L, fileId = saved.id)
            val synchronizations = TransactionSynchronizationManager.getSynchronizations()

            assertThat(storage.deletedObjectKeys).isEmpty()
            synchronizations.single().afterCommit()
            assertThat(storage.deletedObjectKeys).containsExactly(saved.objectKey)
        } finally {
            TransactionSynchronizationManager.clearSynchronization()
        }
    }

    @Test
    @DisplayName("delete 후 commit 이후 object 삭제 실패는 요청 성공 이후 로그로만 남긴다")
    fun `delete 후 commit 이후 object 삭제 실패는 요청 성공 이후 로그로만 남긴다`() {
        val saved =
            repository.save(
                cloudFile(
                    ownerMemberId = 7L,
                    objectKey = "cloud/7/docs/delete-fail.pdf",
                    originalFilename = "delete-fail.pdf",
                    mediaKind = CloudFileMediaKind.DOCUMENT,
                    folderPath = "docs",
                ),
            )
        storage.deleteFailure = IllegalStateException("delete failed")

        TransactionSynchronizationManager.initSynchronization()
        try {
            service.delete(ownerMemberId = 7L, fileId = saved.id)
            val synchronization = TransactionSynchronizationManager.getSynchronizations().single()

            synchronization.afterCommit()

            assertThat(repository.findActiveByIdAndOwner(saved.id, 7L)).isNull()
            assertThat(storage.deletedObjectKeys).containsExactly(saved.objectKey)
        } finally {
            TransactionSynchronizationManager.clearSynchronization()
            storage.deleteFailure = null
        }
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

    @Test
    @DisplayName("delete 시 파일이 없으면 metadata와 object를 삭제하지 않는다")
    fun `delete는 파일이 없으면 metadata와 object를 삭제하지 않는다`() {
        assertThatThrownBy {
            service.delete(ownerMemberId = 7L, fileId = 404L)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("파일을 찾을 수 없습니다")

        assertThat(repository.savedFiles).isEmpty()
        assertThat(storage.deletedObjectKeys).isEmpty()
    }

    @Test
    @DisplayName("UploadRequest는 bytes 내용을 기준으로 동일성을 비교한다")
    fun `UploadRequest는 bytes 내용을 기준으로 동일성을 비교한다`() {
        val first =
            CloudStoragePort.UploadRequest(
                objectKey = "cloud/7/docs/file.pdf",
                bytes = "%PDF-1.7".toByteArray(),
                contentType = "application/pdf",
                originalFilename = "file.pdf",
            )
        val second =
            CloudStoragePort.UploadRequest(
                objectKey = "cloud/7/docs/file.pdf",
                bytes = "%PDF-1.7".toByteArray(),
                contentType = "application/pdf",
                originalFilename = "file.pdf",
            )

        assertThat(first).isEqualTo(second)
        assertThat(first.hashCode()).isEqualTo(second.hashCode())
        assertThat(first.objectKey).isEqualTo("cloud/7/docs/file.pdf")
        assertThat(first.bytes).containsExactly(*"%PDF-1.7".toByteArray())
        assertThat(first.contentType).isEqualTo("application/pdf")
        assertThat(first.originalFilename).isEqualTo("file.pdf")
        assertThat(first).isNotEqualTo(
            CloudStoragePort.UploadRequest(
                objectKey = "cloud/7/docs/other.pdf",
                bytes = "%PDF-1.7".toByteArray(),
                contentType = "application/pdf",
                originalFilename = "file.pdf",
            ),
        )
        assertThat(first.toString()).contains("bytes=8 bytes")
    }

    @Test
    @DisplayName("StoredObject close는 내부 inputStream을 닫는다")
    fun `StoredObject close는 내부 inputStream을 닫는다`() {
        val inputStream = CloseAwareInputStream("stream".toByteArray())
        val storedObject =
            CloudStoragePort.StoredObject(
                inputStream = inputStream,
                contentType = "application/pdf",
                contentLength = 6L,
                originalFilename = "stream.pdf",
            )

        storedObject.close()

        assertThat(inputStream.closed).isTrue()
        assertThat(storedObject.originalFilename).isEqualTo("stream.pdf")
    }

    private data class SignatureCase(
        val filename: String,
        val contentType: String?,
        val bytes: ByteArray,
        val mediaKind: CloudFileMediaKind,
    )

    private class FakeCloudFileRepository : CloudFileRepositoryPort {
        val savedFiles = mutableListOf<CloudFile>()
        var onSave: ((CloudFile) -> Unit)? = null
        var assignAuditTimestamps: Boolean = false
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
            if (assignAuditTimestamps) {
                stored.createdAt = Instant.parse("2026-06-12T00:00:00Z")
                stored.modifiedAt = Instant.parse("2026-06-12T00:00:00Z")
            }
            onSave?.invoke(stored)
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
        var deleteFailure: RuntimeException? = null

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
            deleteFailure?.let { throw it }
        }
    }

    private class CloseAwareInputStream(
        bytes: ByteArray,
    ) : ByteArrayInputStream(bytes) {
        var closed: Boolean = false

        override fun close() {
            closed = true
            super.close()
        }
    }

    private fun hasUnpairedSurrogate(value: String): Boolean {
        var index = 0
        while (index < value.length) {
            val current = value[index]
            if (Character.isHighSurrogate(current)) {
                if (index + 1 >= value.length || !Character.isLowSurrogate(value[index + 1])) return true
                index += 2
                continue
            }
            if (Character.isLowSurrogate(current)) return true
            index += 1
        }

        return false
    }

    private fun metadataEncodedLength(value: String): Int =
        URLEncoder
            .encode(value, StandardCharsets.UTF_8)
            .replace("+", "%20")
            .toByteArray(StandardCharsets.US_ASCII)
            .size

    companion object {
        private val PNG_BYTES =
            byteArrayOf(
                0x89.toByte(),
                0x50,
                0x4E,
                0x47,
                0x0D,
                0x0A,
                0x1A,
                0x0A,
            )

        private fun zipBytes(): ByteArray =
            zip(
                "Contents/content.hpf" to "<package />",
                "Contents/header.xml" to "<header />",
            )

        private fun zipBytesWithLargeLeadingEntry(): ByteArray =
            zip(
                "filler.bin" to "0".repeat(1024 * 1024),
                "Contents/content.hpf" to "<package />",
                "Contents/header.xml" to "<header />",
            )

        private fun invalidZipBytes(): ByteArray =
            byteArrayOf(
                0x50,
                0x4B,
                0x03,
                0x06,
                0x14,
                0x00,
                0x00,
                0x00,
            )

        private fun truncatedZipBytes(): ByteArray =
            byteArrayOf(
                0x50,
                0x4B,
                0x03,
                0x04,
                0x14,
                0x00,
                0x00,
                0x00,
            )

        private fun genericZipBytes(): ByteArray =
            zip(
                "readme.txt" to "not an hwpx package",
            )

        private fun zip(vararg entries: Pair<String, String>): ByteArray {
            val output = ByteArrayOutputStream()
            ZipOutputStream(output).use { zip ->
                entries.forEach { (name, content) ->
                    zip.putNextEntry(ZipEntry(name))
                    zip.write(content.toByteArray(StandardCharsets.UTF_8))
                    zip.closeEntry()
                }
            }
            return output.toByteArray()
        }

        private fun cloudFile(
            ownerMemberId: Long,
            objectKey: String,
            originalFilename: String,
            mediaKind: CloudFileMediaKind,
            folderPath: String,
        ): CloudFile =
            CloudFile.create(
                ownerMemberId = ownerMemberId,
                objectKey = objectKey,
                originalFilename = originalFilename,
                contentType =
                    when (mediaKind) {
                        CloudFileMediaKind.DOCUMENT -> "application/pdf"
                        CloudFileMediaKind.PHOTO -> "image/png"
                        CloudFileMediaKind.VIDEO -> "video/mp4"
                    },
                byteSize = 9L,
                mediaKind = mediaKind,
                folderPath = folderPath,
                checksumSha256 = null,
            )
    }
}
