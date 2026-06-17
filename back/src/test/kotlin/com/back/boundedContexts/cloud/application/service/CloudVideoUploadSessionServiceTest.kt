package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.application.port.output.CloudVideoUploadPartRepositoryPort
import com.back.boundedContexts.cloud.application.port.output.CloudVideoUploadSessionRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.boundedContexts.cloud.model.CloudVideoUploadPart
import com.back.boundedContexts.cloud.model.CloudVideoUploadSession
import com.back.boundedContexts.cloud.model.CloudVideoUploadSessionStatus
import com.back.global.exception.application.AppException
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.text.Normalizer
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@DisplayName("관리자 클라우드 대용량 동영상 업로드 서비스 테스트")
class CloudVideoUploadSessionServiceTest {
    private val sessionRepository = FakeVideoUploadSessionRepository()
    private val partRepository = FakeVideoUploadPartRepository()
    private val fileRepository = FakeCloudFileRepository()
    private val storage = FakeCloudStoragePort()
    private val clock = Clock.fixed(Instant.parse("2026-06-17T00:00:00Z"), ZoneOffset.UTC)
    private val service =
        CloudVideoUploadSessionService(
            sessionRepository = sessionRepository,
            partRepository = partRepository,
            cloudFileRepository = fileRepository,
            cloudStoragePort = storage,
            cloudStorageProperties =
                CloudStorageProperties(
                    maxFileSizeBytes = TEST_PART_SIZE_BYTES,
                    cloudVideoResumableMaxFileSizeBytes = 5L * 1024 * 1024 * 1024,
                    cloudVideoResumablePartSizeBytes = TEST_PART_SIZE_BYTES,
                    cloudVideoResumableExpiresSeconds = 3_600,
                ),
            clock = clock,
        )

    private fun createService(clock: Clock): CloudVideoUploadSessionService =
        CloudVideoUploadSessionService(
            sessionRepository = sessionRepository,
            partRepository = partRepository,
            cloudFileRepository = fileRepository,
            cloudStoragePort = storage,
            cloudStorageProperties =
                CloudStorageProperties(
                    maxFileSizeBytes = TEST_PART_SIZE_BYTES,
                    cloudVideoResumableMaxFileSizeBytes = 5L * 1024 * 1024 * 1024,
                    cloudVideoResumablePartSizeBytes = TEST_PART_SIZE_BYTES,
                    cloudVideoResumableExpiresSeconds = 3_600,
                ),
            clock = clock,
        )

    @Test
    @DisplayName("세션 생성 시 5GB 이하 동영상 metadata와 S3 multipart upload id를 저장한다")
    fun `세션 생성은 동영상 metadata와 multipart upload id를 저장한다`() {
        val nfcName = "대용량_소개영상.mp4"
        val nfdName = Normalizer.normalize(nfcName, Normalizer.Form.NFD)

        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = nfdName,
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES + 12,
                folderPath = "videos",
            )

        assertThat(session.ownerMemberId).isEqualTo(7L)
        assertThat(session.originalFilename).isEqualTo(nfcName)
        assertThat(session.partSizeBytes).isEqualTo(TEST_PART_SIZE_BYTES)
        assertThat(session.totalParts).isEqualTo(2)
        assertThat(session.status).isEqualTo(CloudVideoUploadSessionStatus.IN_PROGRESS)
        assertThat(session.expiresAt).isEqualTo(Instant.parse("2026-06-17T01:00:00Z"))
        assertThat(storage.multipartInits.single().objectKey).startsWith("cloud/7/videos/2026/06/17/")
        assertThat(sessionRepository.savedSessions.single().uploadId).isEqualTo("upload-1")
    }

    @Test
    @DisplayName("파트 업로드 재시도는 같은 크기 조각을 다시 S3에 올리지 않고 완료 시 기존 파일로 승격한다")
    fun `파트 업로드 재시도는 중복 전송 없이 완료 시 파일로 승격한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES + 12,
                folderPath = "",
            )
        val firstPart = mp4Part(TEST_PART_SIZE_BYTES.toInt())
        val lastPart = ByteArray(12) { 1 }

        val firstResult = service.uploadPart(7L, session.id, 1, firstPart)
        val retryResult = service.uploadPart(7L, session.id, 1, firstPart)
        val lastResult = service.uploadPart(7L, session.id, 2, lastPart)
        val completed = service.complete(7L, session.id)

        assertThat(firstResult.session.uploadedParts).containsExactly(1)
        assertThat(retryResult.session.uploadedParts).containsExactly(1)
        assertThat(lastResult.session.uploadedParts).containsExactly(1, 2)
        assertThat(storage.multipartParts).hasSize(2)
        assertThat(
            storage.completedUploads
                .single()
                .parts
                .map { it.partNumber },
        ).containsExactly(1, 2)
        assertThat(completed.mediaKind).isEqualTo(CloudFileMediaKind.VIDEO)
        assertThat(completed.originalFilename).isEqualTo("movie.mp4")
        assertThat(sessionRepository.savedSessions.last().status).isEqualTo(CloudVideoUploadSessionStatus.COMPLETED)
        assertThat(sessionRepository.savedSessions.last().completedFileId).isEqualTo(completed.id)
    }

    @Test
    @DisplayName("상태 조회는 업로드된 조각 번호를 정렬해서 반환한다")
    fun `상태 조회는 업로드된 조각 번호를 정렬해서 반환한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES + 12,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))

        val found = service.getSession(7L, session.id)

        assertThat(found.id).isEqualTo(session.id)
        assertThat(found.uploadedParts).containsExactly(1)
    }

    @Test
    @DisplayName("만료된 세션 조회는 multipart upload를 abort하고 410으로 거절한다")
    fun `만료된 세션 조회는 abort 후 410으로 거절한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        val expiredService =
            createService(
                clock = Clock.fixed(Instant.parse("2026-06-17T02:00:00Z"), ZoneOffset.UTC),
            )

        assertThatThrownBy {
            expiredService.getSession(7L, session.id)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("만료")

        assertThat(storage.abortedUploads.single().uploadId).isEqualTo("upload-1")
        assertThat(partRepository.findBySessionId(session.id)).isEmpty()
        assertThat(sessionRepository.savedSessions.last().status).isEqualTo(CloudVideoUploadSessionStatus.EXPIRED)
    }

    @Test
    @DisplayName("파트 업로드 시 owner와 조각 번호와 첫 조각 시그니처를 검증한다")
    fun `파트 업로드는 owner 조각 번호 첫 조각 시그니처를 검증한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )

        assertThatThrownBy {
            service.uploadPart(8L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("세션을 찾을 수 없습니다")

        assertThatThrownBy {
            service.uploadPart(7L, session.id, 2, ByteArray(1))
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("조각 번호")

        assertThatThrownBy {
            service.uploadPart(7L, session.id, 1, ByteArray(TEST_PART_SIZE_BYTES.toInt()) { 1 })
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("지원하지 않는 동영상")

        assertThat(storage.multipartParts).isEmpty()
    }

    @Test
    @DisplayName("파트 업로드 시 이미 저장된 조각과 크기가 다르면 재시도를 거절한다")
    fun `파트 업로드는 기존 조각과 크기가 다른 재시도를 거절한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES + 12,
                folderPath = "",
            )
        partRepository.save(
            CloudVideoUploadPart(
                sessionId = session.id,
                partNumber = 1,
                eTag = "etag-stale",
                byteSize = 1,
            ),
        )

        assertThatThrownBy {
            service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("다른 크기")

        assertThat(storage.multipartParts).isEmpty()
    }

    @Test
    @DisplayName("완료 시 누락된 조각이 있으면 기존 파일로 승격하지 않는다")
    fun `완료는 누락된 조각이 있으면 거절한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES + 12,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))

        assertThatThrownBy {
            service.complete(7L, session.id)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("업로드되지 않은")

        assertThat(storage.completedUploads).isEmpty()
    }

    @Test
    @DisplayName("종료된 세션은 추가 조각 업로드를 거절한다")
    fun `종료된 세션은 추가 조각 업로드를 거절한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.cancel(7L, session.id)

        assertThatThrownBy {
            service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("이미 종료된")
    }

    @Test
    @DisplayName("만료된 세션은 S3 multipart upload를 abort하고 EXPIRED 상태로 전환한다")
    fun `만료된 세션은 abort 후 EXPIRED 상태로 전환한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        val expiredService =
            createService(
                clock = Clock.fixed(Instant.parse("2026-06-17T02:00:00Z"), ZoneOffset.UTC),
            )

        assertThatThrownBy {
            expiredService.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("만료")

        assertThat(storage.abortedUploads.single().uploadId).isEqualTo("upload-1")
        assertThat(sessionRepository.savedSessions.last().status).isEqualTo(CloudVideoUploadSessionStatus.EXPIRED)
    }

    @Test
    @DisplayName("만료 정리는 방치된 multipart upload를 abort하고 조각을 삭제한다")
    fun `만료 정리는 방치된 multipart upload를 abort하고 조각을 삭제한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        val expiredService =
            createService(
                clock = Clock.fixed(Instant.parse("2026-06-17T02:00:00Z"), ZoneOffset.UTC),
            )

        val purgedCount = expiredService.purgeExpiredSessions(batchSize = 100)

        assertThat(purgedCount).isEqualTo(1)
        assertThat(storage.abortedUploads.single().uploadId).isEqualTo("upload-1")
        assertThat(partRepository.findBySessionId(session.id)).isEmpty()
        assertThat(sessionRepository.savedSessions.last().status).isEqualTo(CloudVideoUploadSessionStatus.EXPIRED)
    }

    @Test
    @DisplayName("만료 정리는 일부 abort 실패에도 다음 세션 정리를 계속한다")
    fun `만료 정리는 일부 abort 실패에도 다음 세션 정리를 계속한다`() {
        val first =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "first.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        val second =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "second.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        storage.failingAbortUploadIds += "upload-1"
        val expiredService =
            createService(
                clock = Clock.fixed(Instant.parse("2026-06-17T02:00:00Z"), ZoneOffset.UTC),
            )

        val purgedCount = expiredService.purgeExpiredSessions(batchSize = 100)

        assertThat(purgedCount).isEqualTo(1)
        assertThat(storage.abortedUploads.single().uploadId).isEqualTo("upload-2")
        assertThat(sessionRepository.savedSessions.first { it.id == first.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.IN_PROGRESS)
        assertThat(sessionRepository.savedSessions.first { it.id == second.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.EXPIRED)
    }

    @Test
    @DisplayName("마지막이 아닌 조각 크기가 세션 part size와 다르면 거절한다")
    fun `마지막이 아닌 조각 크기가 다르면 거절한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES + 12,
                folderPath = "",
            )

        assertThatThrownBy {
            service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt() - 1))
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("조각 크기")

        assertThat(storage.multipartParts).isEmpty()
    }

    @Test
    @DisplayName("콘텐츠 타입과 첫 조각 시그니처가 다르면 업로드를 거절한다")
    fun `콘텐츠 타입과 첫 조각 시그니처가 다르면 업로드를 거절한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.webm",
                contentType = "video/webm",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )

        assertThatThrownBy {
            service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("일치하지 않습니다")
    }

    @Test
    @DisplayName("동영상 MIME이 비어 있으면 확장자로 mp4와 webm 콘텐츠 타입을 결정한다")
    fun `동영상 MIME이 비어 있으면 확장자로 콘텐츠 타입을 결정한다`() {
        val mp4Session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "clip.m4v",
                contentType = "",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        val webmSession =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "clip.webm",
                contentType = null,
                byteSize = 4,
                folderPath = "",
            )

        val webmResult = service.uploadPart(7L, webmSession.id, 1, webmPart())

        assertThat(mp4Session.contentType).isEqualTo("video/mp4")
        assertThat(webmSession.contentType).isEqualTo("video/webm")
        assertThat(webmResult.part.byteSize).isEqualTo(4)
    }

    @Test
    @DisplayName("긴 동영상 파일명은 metadata 제한 후에도 확장자를 보존한다")
    fun `긴 동영상 파일명은 metadata 제한 후에도 확장자를 보존한다`() {
        val longFilename = "${"가".repeat(400)}.mp4"

        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = longFilename,
                contentType = "",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )

        assertThat(session.contentType).isEqualTo("video/mp4")
        assertThat(session.originalFilename).endsWith(".mp4")
        assertThat(storage.multipartInits.single().originalFilename).endsWith(".mp4")
    }

    @Test
    @DisplayName("지원하지 않는 확장자와 유효하지 않은 폴더 경로는 세션 생성에서 거절한다")
    fun `지원하지 않는 확장자와 유효하지 않은 폴더 경로는 거절한다`() {
        assertThatThrownBy {
            service.createSession(7L, "movie.avi", "", TEST_PART_SIZE_BYTES, "")
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("지원하지 않는 동영상")

        assertThatThrownBy {
            service.createSession(7L, "movie.mp4", "video/mp4", TEST_PART_SIZE_BYTES, "../private")
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("폴더 경로")
    }

    @Test
    @DisplayName("세션 생성 시 5GB 초과 동영상은 S3 multipart를 시작하지 않는다")
    fun `세션 생성은 5GB 초과 동영상을 차단한다`() {
        assertThatThrownBy {
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "too-large.mp4",
                contentType = "video/mp4",
                byteSize = 5L * 1024 * 1024 * 1024 + 1,
                folderPath = "",
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("5 GB")

        assertThat(storage.multipartInits).isEmpty()
        assertThat(sessionRepository.savedSessions).isEmpty()
    }

    @Test
    @DisplayName("취소 시 S3 multipart upload를 abort하고 저장된 조각을 삭제한다")
    fun `취소는 multipart upload를 abort하고 조각을 삭제한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))

        service.cancel(7L, session.id)

        assertThat(storage.abortedUploads.single().uploadId).isEqualTo("upload-1")
        assertThat(partRepository.findBySessionId(session.id)).isEmpty()
        assertThat(sessionRepository.savedSessions.last().status).isEqualTo(CloudVideoUploadSessionStatus.CANCELLED)
    }

    @Test
    @DisplayName("multipart part request는 ByteArray 내용을 기준으로 equals와 hashCode를 계산한다")
    fun `multipart part request는 ByteArray 내용 기준으로 비교한다`() {
        val first =
            CloudStoragePort.MultipartUploadPartRequest(
                objectKey = "cloud/7/movie.mp4",
                uploadId = "upload-1",
                partNumber = 1,
                bytes = byteArrayOf(1, 2, 3),
            )
        val second =
            CloudStoragePort.MultipartUploadPartRequest(
                objectKey = "cloud/7/movie.mp4",
                uploadId = "upload-1",
                partNumber = 1,
                bytes = byteArrayOf(1, 2, 3),
            )
        val different =
            CloudStoragePort.MultipartUploadPartRequest(
                objectKey = "cloud/7/movie.mp4",
                uploadId = "upload-1",
                partNumber = 1,
                bytes = byteArrayOf(1, 2, 4),
            )

        assertThat(first).isEqualTo(second)
        assertThat(first.hashCode()).isEqualTo(second.hashCode())
        assertThat(first).isNotEqualTo(different)
    }

    private class FakeVideoUploadSessionRepository : CloudVideoUploadSessionRepositoryPort {
        val savedSessions = mutableListOf<CloudVideoUploadSession>()
        private var nextId = 1L

        override fun save(session: CloudVideoUploadSession): CloudVideoUploadSession {
            val stored =
                if (session.id == 0L) {
                    CloudVideoUploadSession(
                        id = nextId++,
                        ownerMemberId = session.ownerMemberId,
                        objectKey = session.objectKey,
                        uploadId = session.uploadId,
                        originalFilename = session.originalFilename,
                        contentType = session.contentType,
                        byteSize = session.byteSize,
                        folderPath = session.folderPath,
                        partSizeBytes = session.partSizeBytes,
                        totalParts = session.totalParts,
                        expiresAt = session.expiresAt,
                        status = session.status,
                        completedFileId = session.completedFileId,
                    )
                } else {
                    session
                }
            stored.createdAt = Instant.parse("2026-06-17T00:00:00Z")
            stored.modifiedAt = Instant.parse("2026-06-17T00:00:00Z")
            savedSessions.removeIf { it.id == stored.id }
            savedSessions += stored
            return stored
        }

        override fun findByIdAndOwner(
            id: Long,
            ownerMemberId: Long,
        ): CloudVideoUploadSession? = savedSessions.firstOrNull { it.id == id && it.ownerMemberId == ownerMemberId }

        override fun findExpiredInProgress(
            now: Instant,
            limit: Int,
        ): List<CloudVideoUploadSession> =
            savedSessions
                .filter {
                    it.status == CloudVideoUploadSessionStatus.IN_PROGRESS &&
                        it.expiresAt <= now
                }.sortedWith(compareBy<CloudVideoUploadSession> { it.expiresAt }.thenBy { it.id })
                .take(limit.coerceAtLeast(1))
    }

    private class FakeVideoUploadPartRepository : CloudVideoUploadPartRepositoryPort {
        private val parts = mutableListOf<CloudVideoUploadPart>()
        private var nextId = 1L

        override fun save(part: CloudVideoUploadPart): CloudVideoUploadPart {
            val stored =
                if (part.id == 0L) {
                    CloudVideoUploadPart(
                        id = nextId++,
                        sessionId = part.sessionId,
                        partNumber = part.partNumber,
                        eTag = part.eTag,
                        byteSize = part.byteSize,
                    )
                } else {
                    part
                }
            stored.createdAt = Instant.parse("2026-06-17T00:00:00Z")
            stored.modifiedAt = Instant.parse("2026-06-17T00:00:00Z")
            parts.removeIf { it.id == stored.id || it.sessionId == stored.sessionId && it.partNumber == stored.partNumber }
            parts += stored
            return stored
        }

        override fun findBySessionIdAndPartNumber(
            sessionId: Long,
            partNumber: Int,
        ): CloudVideoUploadPart? = parts.firstOrNull { it.sessionId == sessionId && it.partNumber == partNumber }

        override fun findBySessionId(sessionId: Long): List<CloudVideoUploadPart> =
            parts.filter { it.sessionId == sessionId }.sortedBy { it.partNumber }

        override fun deleteBySessionId(sessionId: Long) {
            parts.removeIf { it.sessionId == sessionId }
        }
    }

    private class FakeCloudFileRepository : CloudFileRepositoryPort {
        private val files = mutableListOf<CloudFile>()
        private var nextId = 1L

        override fun save(file: CloudFile): CloudFile {
            val stored =
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
            stored.createdAt = Instant.parse("2026-06-17T00:00:00Z")
            stored.modifiedAt = Instant.parse("2026-06-17T00:00:00Z")
            files += stored
            return stored
        }

        override fun findActiveByOwner(
            ownerMemberId: Long,
            folderPath: String?,
            keyword: String?,
            mediaKind: CloudFileMediaKind?,
        ): List<CloudFile> = files

        override fun findActiveByIdAndOwner(
            id: Long,
            ownerMemberId: Long,
        ): CloudFile? = files.firstOrNull { it.id == id && it.ownerMemberId == ownerMemberId }
    }

    private class FakeCloudStoragePort : CloudStoragePort {
        val multipartInits = mutableListOf<CloudStoragePort.MultipartUploadInitRequest>()
        val multipartParts = mutableListOf<CloudStoragePort.MultipartUploadPartRequest>()
        val completedUploads = mutableListOf<CloudStoragePort.MultipartUploadCompleteRequest>()
        val abortedUploads = mutableListOf<CloudStoragePort.MultipartUploadAbortRequest>()
        val failingAbortUploadIds = mutableSetOf<String>()

        override fun upload(request: CloudStoragePort.UploadRequest): CloudStoragePort.UploadResult =
            CloudStoragePort.UploadResult(request.objectKey, "checksum")

        override fun initiateMultipartUpload(
            request: CloudStoragePort.MultipartUploadInitRequest,
        ): CloudStoragePort.MultipartUploadInitResult {
            multipartInits += request
            return CloudStoragePort.MultipartUploadInitResult(
                objectKey = request.objectKey,
                uploadId = "upload-${multipartInits.size}",
            )
        }

        override fun uploadMultipartPart(
            request: CloudStoragePort.MultipartUploadPartRequest,
        ): CloudStoragePort.MultipartUploadPartResult {
            multipartParts += request
            return CloudStoragePort.MultipartUploadPartResult(
                partNumber = request.partNumber,
                eTag = "etag-${request.partNumber}",
            )
        }

        override fun completeMultipartUpload(request: CloudStoragePort.MultipartUploadCompleteRequest) {
            completedUploads += request
        }

        override fun abortMultipartUpload(request: CloudStoragePort.MultipartUploadAbortRequest) {
            if (request.uploadId in failingAbortUploadIds) {
                throw IllegalStateException("abort failed")
            }
            abortedUploads += request
        }

        override fun open(objectKey: String): CloudStoragePort.StoredObject? =
            CloudStoragePort.StoredObject(ByteArrayInputStream(ByteArray(0)), "video/mp4", 0, "empty.mp4")

        override fun delete(objectKey: String) = Unit
    }

    companion object {
        private const val TEST_PART_SIZE_BYTES = 5L * 1024 * 1024

        private fun mp4Part(size: Int): ByteArray =
            ByteArray(size).also {
                byteArrayOf(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0).copyInto(it)
            }

        private fun webmPart(): ByteArray = byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte())
    }
}
