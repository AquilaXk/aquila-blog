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

    private fun CloudVideoUploadSessionService.uploadPart(
        ownerMemberId: Long,
        sessionId: Long,
        partNumber: Int,
        bytes: ByteArray,
    ): CloudVideoUploadPartResultDto =
        uploadPart(
            ownerMemberId = ownerMemberId,
            sessionId = sessionId,
            partNumber = partNumber,
            inputStream = ByteArrayInputStream(bytes),
            contentLength = bytes.size.toLong(),
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
    @DisplayName("기본 설정 생성자는 빈 만료·stale 세션 정리를 수행할 수 있다")
    fun defaultConstructorArguments() {
        val defaultService =
            CloudVideoUploadSessionService(
                sessionRepository = FakeVideoUploadSessionRepository(),
                partRepository = FakeVideoUploadPartRepository(),
                cloudFileRepository = FakeCloudFileRepository(),
                cloudStoragePort = FakeCloudStoragePort(),
            )

        assertThat(defaultService.purgeExpiredSessions(batchSize = 1)).isZero()
        assertThat(defaultService.purgeStaleIntermediateSessions(batchSize = 1)).isZero()
    }

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
    @DisplayName("세션 생성은 설정된 클라우드 키 prefix로 S3 object key를 만든다")
    fun `세션 생성은 설정된 클라우드 키 prefix를 사용한다`() {
        val prefixedService =
            CloudVideoUploadSessionService(
                sessionRepository = sessionRepository,
                partRepository = partRepository,
                cloudFileRepository = fileRepository,
                cloudStoragePort = storage,
                cloudStorageProperties =
                    CloudStorageProperties(
                        maxFileSizeBytes = TEST_PART_SIZE_BYTES,
                        cloudKeyPrefix = "/admin-cloud/",
                        cloudVideoResumableMaxFileSizeBytes = 5L * 1024 * 1024 * 1024,
                        cloudVideoResumablePartSizeBytes = TEST_PART_SIZE_BYTES,
                        cloudVideoResumableExpiresSeconds = 3_600,
                    ),
                clock = clock,
            )

        prefixedService.createSession(
            ownerMemberId = 7L,
            originalFilename = "movie.mp4",
            contentType = "video/mp4",
            byteSize = TEST_PART_SIZE_BYTES,
            folderPath = "videos",
        )

        assertThat(storage.multipartInits.single().objectKey).startsWith("admin-cloud/7/videos/2026/06/17/")
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
        assertThat(firstResult.session.status).isEqualTo(CloudVideoUploadSessionStatus.IN_PROGRESS)
        assertThat(retryResult.session.uploadedParts).containsExactly(1)
        assertThat(retryResult.session.status).isEqualTo(CloudVideoUploadSessionStatus.IN_PROGRESS)
        assertThat(lastResult.session.uploadedParts).containsExactly(1, 2)
        assertThat(lastResult.session.status).isEqualTo(CloudVideoUploadSessionStatus.IN_PROGRESS)
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
    @DisplayName("S3 원격 호출 진입점은 서비스 레벨 트랜잭션을 잡지 않는다")
    fun `S3 원격 호출 진입점은 서비스 트랜잭션을 잡지 않는다`() {
        val transactionalAnnotationName = "org.springframework.transaction.annotation.Transactional"
        val methods =
            listOf(
                CloudVideoUploadSessionService::class.java
                    .getMethod(
                        "createSession",
                        java.lang.Long.TYPE,
                        String::class.java,
                        String::class.java,
                        java.lang.Long.TYPE,
                        String::class.java,
                    ),
                CloudVideoUploadSessionService::class.java
                    .getMethod(
                        "uploadPart",
                        java.lang.Long.TYPE,
                        java.lang.Long.TYPE,
                        Integer.TYPE,
                        java.io.InputStream::class.java,
                        java.lang.Long.TYPE,
                    ),
                CloudVideoUploadSessionService::class.java
                    .getMethod("complete", java.lang.Long.TYPE, java.lang.Long.TYPE),
                CloudVideoUploadSessionService::class.java
                    .getMethod("cancel", java.lang.Long.TYPE, java.lang.Long.TYPE),
            )

        assertThat(methods.flatMap { it.annotations.map { annotation -> annotation.annotationClass.qualifiedName } })
            .doesNotContain(transactionalAnnotationName)
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
            .isEqualTo(CloudVideoUploadSessionStatus.FAILED)
        assertThat(sessionRepository.savedSessions.first { it.id == first.id }.failureReason)
            .contains("multipart abort failed")
        assertThat(sessionRepository.savedSessions.first { it.id == second.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.EXPIRED)
    }

    @Test
    @DisplayName("stale UPLOADING_PART 회수는 abort 후 FAILED로 종결한다")
    fun `stale UPLOADING_PART 회수는 abort 후 FAILED로 종결한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        val stored = sessionRepository.savedSessions.single { it.id == session.id }
        stored.status = CloudVideoUploadSessionStatus.UPLOADING_PART
        stored.modifiedAt = Instant.parse("2026-06-17T00:00:00Z")
        val staleService =
            createService(
                clock = Clock.fixed(Instant.parse("2026-06-17T01:30:00Z"), ZoneOffset.UTC),
            )

        val recovered = staleService.purgeStaleIntermediateSessions(batchSize = 100)

        assertThat(recovered).isEqualTo(1)
        assertThat(storage.abortedUploads.single().uploadId).isEqualTo("upload-1")
        assertThat(partRepository.findBySessionId(session.id)).isEmpty()
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.FAILED)
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.failureReason)
            .contains("stale intermediate")
    }

    @Test
    @DisplayName("stale INITIATING은 uploadId가 없으면 abort 없이 FAILED로 종결한다")
    fun `stale INITIATING은 uploadId가 없으면 abort 없이 FAILED로 종결한다`() {
        val stuck =
            sessionRepository.save(
                CloudVideoUploadSession(
                    ownerMemberId = 7L,
                    objectKey = "cloud/7/2026/06/17/stuck-init.mp4",
                    uploadId = null,
                    originalFilename = "stuck.mp4",
                    contentType = "video/mp4",
                    byteSize = TEST_PART_SIZE_BYTES,
                    folderPath = "",
                    partSizeBytes = TEST_PART_SIZE_BYTES,
                    totalParts = 1,
                    expiresAt = Instant.parse("2026-06-18T00:00:00Z"),
                    status = CloudVideoUploadSessionStatus.INITIATING,
                ),
            )
        stuck.modifiedAt = Instant.parse("2026-06-17T00:00:00Z")
        val staleService =
            createService(
                clock = Clock.fixed(Instant.parse("2026-06-17T00:20:00Z"), ZoneOffset.UTC),
            )

        val recovered = staleService.purgeStaleIntermediateSessions(batchSize = 100)

        assertThat(recovered).isEqualTo(1)
        assertThat(storage.abortedUploads).isEmpty()
        assertThat(sessionRepository.savedSessions.single { it.id == stuck.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.FAILED)
        assertThat(sessionRepository.savedSessions.single { it.id == stuck.id }.failureReason)
            .contains("without uploadId")
    }

    @Test
    @DisplayName("stale COMPLETING은 HeadObject 커밋이면 abort 없이 CloudFile로 승계한다")
    fun `stale COMPLETING은 HeadObject 커밋이면 abort 없이 CloudFile로 승계한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        val stored = sessionRepository.savedSessions.single { it.id == session.id }
        stored.status = CloudVideoUploadSessionStatus.COMPLETING
        stored.modifiedAt = Instant.parse("2026-06-17T00:00:00Z")
        storage.objectHeads[stored.objectKey] =
            CloudStoragePort.ObjectHead(
                objectKey = stored.objectKey,
                contentLength = stored.byteSize,
                contentType = "video/mp4",
                eTag = "etag-committed",
            )
        val staleService =
            createService(
                clock = Clock.fixed(Instant.parse("2026-06-17T00:45:00Z"), ZoneOffset.UTC),
            )

        val recovered = staleService.purgeStaleIntermediateSessions(batchSize = 100)

        assertThat(recovered).isEqualTo(1)
        assertThat(storage.abortedUploads).isEmpty()
        val completed = sessionRepository.savedSessions.single { it.id == session.id }
        assertThat(completed.status).isEqualTo(CloudVideoUploadSessionStatus.COMPLETED)
        assertThat(completed.completedFileId).isNotNull()
        assertThat(fileRepository.findActiveByIdAndOwner(completed.completedFileId!!, 7L)).isNotNull()
        assertThat(partRepository.findBySessionId(session.id)).isNotEmpty()
    }

    @Test
    @DisplayName("stale COMPLETING은 HeadObject 미커밋이면 abort 후 FAILED로 종결한다")
    fun `stale COMPLETING은 HeadObject 미커밋이면 abort 후 FAILED로 종결한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        val stored = sessionRepository.savedSessions.single { it.id == session.id }
        stored.status = CloudVideoUploadSessionStatus.COMPLETING
        stored.modifiedAt = Instant.parse("2026-06-17T00:00:00Z")
        storage.objectHeads[stored.objectKey] =
            CloudStoragePort.ObjectHead(
                objectKey = stored.objectKey,
                contentLength = stored.byteSize - 1,
                contentType = "video/mp4",
                eTag = "etag-partial",
            )
        val staleService =
            createService(
                clock = Clock.fixed(Instant.parse("2026-06-17T00:45:00Z"), ZoneOffset.UTC),
            )

        val recovered = staleService.purgeStaleIntermediateSessions(batchSize = 100)

        assertThat(recovered).isEqualTo(1)
        assertThat(storage.abortedUploads.single().uploadId).isEqualTo("upload-1")
        assertThat(partRepository.findBySessionId(session.id)).isEmpty()
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.FAILED)
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
    @DisplayName("조각 stream이 선언 길이보다 짧으면 storage에 올리지 않는다")
    fun `조각 upload는 짧은 stream을 storage 저장 전에 차단한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )

        assertThatThrownBy {
            service.uploadPart(
                ownerMemberId = 7L,
                sessionId = session.id,
                partNumber = 1,
                inputStream = ByteArrayInputStream(ByteArray(0)),
                contentLength = TEST_PART_SIZE_BYTES,
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("조각 크기")

        assertThat(storage.multipartParts).isEmpty()
    }

    @Test
    @DisplayName("조각 stream이 선언 길이보다 길면 storage에 올리지 않는다")
    fun `조각 upload는 긴 stream을 storage 저장 전에 차단한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )

        assertThatThrownBy {
            service.uploadPart(
                ownerMemberId = 7L,
                sessionId = session.id,
                partNumber = 1,
                inputStream = ByteArrayInputStream(mp4Part(TEST_PART_SIZE_BYTES.toInt() + 1)),
                contentLength = TEST_PART_SIZE_BYTES,
            )
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
    @DisplayName("세션 생성 시 S3 multipart 최대 조각 수를 넘는 설정은 시작하지 않는다")
    fun `세션 생성은 S3 multipart 최대 조각 수 초과를 차단한다`() {
        val oversizedService =
            CloudVideoUploadSessionService(
                sessionRepository = sessionRepository,
                partRepository = partRepository,
                cloudFileRepository = fileRepository,
                cloudStoragePort = storage,
                cloudStorageProperties =
                    CloudStorageProperties(
                        maxFileSizeBytes = 5L * 1024 * 1024,
                        cloudVideoResumableMaxFileSizeBytes = 60L * 1024 * 1024 * 1024,
                        cloudVideoResumablePartSizeBytes = 5L * 1024 * 1024,
                        cloudVideoResumableExpiresSeconds = 3_600,
                    ),
                clock = clock,
            )

        assertThatThrownBy {
            oversizedService.createSession(
                ownerMemberId = 7L,
                originalFilename = "too-many-parts.mp4",
                contentType = "video/mp4",
                byteSize = 50_000L * 1024 * 1024 + 1,
                folderPath = "",
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("10,000")

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
    @DisplayName("S3 initiate 실패는 DB 세션을 FAILED로 남긴다")
    fun `S3 initiate 실패는 FAILED 상태로 남긴다`() {
        storage.failInitiate = true

        assertThatThrownBy {
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("initiate failed")

        assertThat(sessionRepository.savedSessions.single().status).isEqualTo(CloudVideoUploadSessionStatus.FAILED)
        assertThat(sessionRepository.savedSessions.single().failureReason).contains("multipart initiate failed")
    }

    @Test
    @DisplayName("파트 S3 업로드 성공 후 metadata 저장 실패는 FAILED로 남긴다")
    fun `파트 metadata 저장 실패는 FAILED 상태로 남긴다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        partRepository.failSave = true

        assertThatThrownBy {
            service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("part save failed")

        assertThat(storage.multipartParts.single().partNumber).isEqualTo(1)
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.FAILED)
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.failureReason)
            .contains("metadata save failed")
    }

    @Test
    @DisplayName("complete S3 성공 후 파일 metadata 저장 실패는 COMPLETING으로 남긴다")
    fun `complete metadata 저장 실패는 COMPLETING 상태로 남긴다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        fileRepository.failSave = true

        assertThatThrownBy {
            service.complete(7L, session.id)
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("file save failed")

        assertThat(storage.completedUploads.single().uploadId).isEqualTo("upload-1")
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.COMPLETING)
    }

    @Test
    @DisplayName("complete metadata 실패 후 COMPLETING 재호출은 CloudFile로 수렴한다")
    fun `complete metadata 실패 후 COMPLETING 재호출은 CloudFile로 수렴한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        fileRepository.failSave = true
        assertThatThrownBy { service.complete(7L, session.id) }
            .isInstanceOf(IllegalStateException::class.java)

        val stored = sessionRepository.savedSessions.single { it.id == session.id }
        storage.objectHeads[stored.objectKey] =
            CloudStoragePort.ObjectHead(
                objectKey = stored.objectKey,
                contentLength = stored.byteSize,
                contentType = "video/mp4",
                eTag = "etag-committed",
            )
        fileRepository.failSave = false

        val completed = service.complete(7L, session.id)

        assertThat(completed.originalFilename).isEqualTo("movie.mp4")
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.COMPLETED)
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.completedFileId)
            .isEqualTo(completed.id)
        assertThat(storage.completedUploads).hasSize(1)
    }

    @Test
    @DisplayName("이미 COMPLETED 세션 complete는 같은 CloudFile을 멱등 반환한다")
    fun `이미 COMPLETED 세션 complete는 같은 CloudFile을 멱등 반환한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        val first = service.complete(7L, session.id)

        val second = service.complete(7L, session.id)

        assertThat(second.id).isEqualTo(first.id)
        assertThat(storage.completedUploads).hasSize(1)
    }

    @Test
    @DisplayName("complete 실패 후 HeadObject 커밋이면 FAILED 없이 메타데이터로 승계한다")
    fun `complete 실패 후 HeadObject 커밋이면 메타데이터로 승계한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        val stored = sessionRepository.savedSessions.single { it.id == session.id }
        storage.failingCompleteUploadIds += "upload-1"
        storage.objectHeadsOnCompleteFailure[stored.objectKey] =
            CloudStoragePort.ObjectHead(
                objectKey = stored.objectKey,
                contentLength = stored.byteSize,
                contentType = "video/mp4",
                eTag = "etag-committed",
            )

        val completed = service.complete(7L, session.id)

        assertThat(completed.id).isPositive()
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.COMPLETED)
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.failureReason).isNull()
    }

    @Test
    @DisplayName("선점 상태의 세션은 cancel과 cleanup이 동시에 처리하지 않는다")
    fun `선점 상태는 cancel과 cleanup을 막는다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        sessionRepository.transitionStatus(
            id = session.id,
            expectedStatus = CloudVideoUploadSessionStatus.IN_PROGRESS,
            nextStatus = CloudVideoUploadSessionStatus.UPLOADING_PART,
            now = clock.instant(),
        )

        assertThatThrownBy {
            service.cancel(7L, session.id)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("진행 중")

        val expiredService =
            createService(
                clock = Clock.fixed(Instant.parse("2026-06-17T02:00:00Z"), ZoneOffset.UTC),
            )
        assertThat(expiredService.purgeExpiredSessions(batchSize = 100)).isZero()
        assertThat(storage.abortedUploads).isEmpty()
    }

    @Test
    @DisplayName("initiate 성공 후 DB 전이 실패는 abort 보상을 시도하고 FAILED로 남긴다")
    fun `initiate 후 DB 전이 실패는 abort 보상 후 FAILED로 남긴다`() {
        sessionRepository.failAttachUploadIdTransition = true
        storage.failingAbortUploadIds += "upload-1"

        assertThatThrownBy {
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("상태가 변경")

        assertThat(storage.multipartInits.single().objectKey).startsWith("cloud/7/2026/06/17/")
        assertThat(storage.abortedUploads).isEmpty()
        assertThat(sessionRepository.savedSessions.single().status).isEqualTo(CloudVideoUploadSessionStatus.FAILED)
        assertThat(sessionRepository.savedSessions.single().failureReason).contains("metadata attach failed")
    }

    @Test
    @DisplayName("S3 part 업로드 실패는 선점 상태를 IN_PROGRESS로 되돌린다")
    fun `S3 part 업로드 실패는 선점 상태를 되돌린다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        storage.failingPartNumbers += 1

        assertThatThrownBy {
            service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("part upload failed")

        assertThat(partRepository.findBySessionId(session.id)).isEmpty()
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.IN_PROGRESS)
    }

    @Test
    @DisplayName("파트 저장 후 IN_PROGRESS 복귀 전이가 실패하면 409로 중단한다")
    fun `파트 저장 후 복귀 전이 실패는 409로 중단한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        sessionRepository.failingTransitions +=
            CloudVideoUploadSessionStatus.UPLOADING_PART to CloudVideoUploadSessionStatus.IN_PROGRESS

        assertThatThrownBy {
            service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("상태가 변경")

        assertThat(partRepository.findBySessionId(session.id)).hasSize(1)
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.UPLOADING_PART)
    }

    @Test
    @DisplayName("complete 선점 전이 실패는 S3 complete를 호출하지 않고 409로 중단한다")
    fun `complete 선점 전이 실패는 S3 complete 없이 중단한다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        sessionRepository.failingTransitions +=
            CloudVideoUploadSessionStatus.IN_PROGRESS to CloudVideoUploadSessionStatus.COMPLETING

        assertThatThrownBy {
            service.complete(7L, session.id)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("진행 중")

        assertThat(storage.completedUploads).isEmpty()
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.IN_PROGRESS)
    }

    @Test
    @DisplayName("S3 complete 실패는 FAILED로 남긴다")
    fun `S3 complete 실패는 FAILED 상태로 남긴다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.uploadPart(7L, session.id, 1, mp4Part(TEST_PART_SIZE_BYTES.toInt()))
        storage.failingCompleteUploadIds += "upload-1"

        assertThatThrownBy {
            service.complete(7L, session.id)
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("complete failed")

        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.status)
            .isEqualTo(CloudVideoUploadSessionStatus.FAILED)
        assertThat(sessionRepository.savedSessions.single { it.id == session.id }.failureReason)
            .contains("multipart complete failed")
    }

    @Test
    @DisplayName("terminal 상태의 cancel은 원격 abort를 다시 호출하지 않는다")
    fun `terminal 상태 cancel은 no-op이다`() {
        val session =
            service.createSession(
                ownerMemberId = 7L,
                originalFilename = "movie.mp4",
                contentType = "video/mp4",
                byteSize = TEST_PART_SIZE_BYTES,
                folderPath = "",
            )
        service.cancel(7L, session.id)

        service.cancel(7L, session.id)

        assertThat(storage.abortedUploads).hasSize(1)
    }

    @Test
    @DisplayName("multipart part request는 stream identity와 contentLength 기준으로 equals와 hashCode를 계산한다")
    fun `multipart part request는 stream identity와 contentLength 기준으로 비교한다`() {
        val inputStream = ByteArrayInputStream(byteArrayOf(1, 2, 3))
        val first =
            CloudStoragePort.MultipartUploadPartRequest(
                objectKey = "cloud/7/movie.mp4",
                uploadId = "upload-1",
                partNumber = 1,
                inputStream = inputStream,
                contentLength = 3,
            )
        val second =
            CloudStoragePort.MultipartUploadPartRequest(
                objectKey = "cloud/7/movie.mp4",
                uploadId = "upload-1",
                partNumber = 1,
                inputStream = inputStream,
                contentLength = 3,
            )
        val different =
            CloudStoragePort.MultipartUploadPartRequest(
                objectKey = "cloud/7/movie.mp4",
                uploadId = "upload-1",
                partNumber = 1,
                inputStream = ByteArrayInputStream(byteArrayOf(1, 2, 3)),
                contentLength = 3,
            )

        assertThat(first).isEqualTo(second)
        assertThat(first.hashCode()).isEqualTo(second.hashCode())
        assertThat(first).isNotEqualTo(different)
    }

    private class FakeVideoUploadSessionRepository : CloudVideoUploadSessionRepositoryPort {
        val savedSessions = mutableListOf<CloudVideoUploadSession>()
        private var nextId = 1L
        var failAttachUploadIdTransition = false
        val failingTransitions = mutableSetOf<Pair<CloudVideoUploadSessionStatus, CloudVideoUploadSessionStatus>>()

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
                        failureReason = session.failureReason,
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

        override fun findStaleIntermediate(
            initiatingCutoff: Instant,
            completingOrAbortingCutoff: Instant,
            uploadingPartCutoff: Instant,
            limit: Int,
        ): List<CloudVideoUploadSession> =
            savedSessions
                .filter { session ->
                    when (session.status) {
                        CloudVideoUploadSessionStatus.INITIATING -> session.modifiedAt <= initiatingCutoff
                        CloudVideoUploadSessionStatus.COMPLETING,
                        CloudVideoUploadSessionStatus.ABORTING,
                        -> session.modifiedAt <= completingOrAbortingCutoff
                        CloudVideoUploadSessionStatus.UPLOADING_PART -> session.modifiedAt <= uploadingPartCutoff
                        else -> false
                    }
                }.sortedWith(compareBy<CloudVideoUploadSession> { it.modifiedAt }.thenBy { it.id })
                .take(limit.coerceAtLeast(1))

        override fun findNonTerminalObjectKeysByPrefix(
            objectKeyPrefix: String,
            limit: Int,
        ): List<String> =
            savedSessions
                .filter {
                    it.status !in
                        setOf(
                            CloudVideoUploadSessionStatus.COMPLETED,
                            CloudVideoUploadSessionStatus.CANCELLED,
                            CloudVideoUploadSessionStatus.EXPIRED,
                            CloudVideoUploadSessionStatus.FAILED,
                        ) &&
                        it.objectKey.startsWith(objectKeyPrefix)
                }.sortedBy { it.id }
                .map { it.objectKey }
                .take(limit.coerceAtLeast(1))

        override fun attachUploadIdAndTransition(
            id: Long,
            expectedStatus: CloudVideoUploadSessionStatus,
            uploadId: String,
            nextStatus: CloudVideoUploadSessionStatus,
            now: Instant,
        ): Int {
            if (failAttachUploadIdTransition) {
                return 0
            }
            val session = savedSessions.firstOrNull { it.id == id && it.status == expectedStatus } ?: return 0
            session.markInitiated(uploadId, now)
            session.transitionTo(nextStatus, now)
            return 1
        }

        override fun transitionStatus(
            id: Long,
            expectedStatus: CloudVideoUploadSessionStatus,
            nextStatus: CloudVideoUploadSessionStatus,
            now: Instant,
        ): Int {
            if (failingTransitions.remove(expectedStatus to nextStatus)) {
                return 0
            }
            val session = savedSessions.firstOrNull { it.id == id && it.status == expectedStatus } ?: return 0
            session.transitionTo(nextStatus, now)
            return 1
        }

        override fun markFailed(
            id: Long,
            expectedStatus: CloudVideoUploadSessionStatus,
            reason: String,
            now: Instant,
        ): Int {
            val session = savedSessions.firstOrNull { it.id == id && it.status == expectedStatus } ?: return 0
            session.fail(reason, now)
            return 1
        }
    }

    private class FakeVideoUploadPartRepository : CloudVideoUploadPartRepositoryPort {
        private val parts = mutableListOf<CloudVideoUploadPart>()
        private var nextId = 1L
        var failSave = false

        override fun save(part: CloudVideoUploadPart): CloudVideoUploadPart {
            if (failSave) {
                throw IllegalStateException("part save failed")
            }
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
        var failSave = false

        override fun save(file: CloudFile): CloudFile {
            if (failSave) {
                throw IllegalStateException("file save failed")
            }
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
        ): CloudFile? = files.firstOrNull { it.id == id && it.ownerMemberId == ownerMemberId && it.deletedAt == null }

        override fun findActiveByObjectKey(objectKey: String): CloudFile? =
            files.firstOrNull { it.objectKey == objectKey && it.deletedAt == null }

        override fun findActiveByObjectKeyStartingWith(
            objectKeyPrefix: String,
            limit: Int,
        ): List<CloudFile> =
            files
                .filter { it.deletedAt == null && it.objectKey.startsWith(objectKeyPrefix) }
                .sortedBy { it.id }
                .take(limit.coerceAtLeast(1))
    }

    private class FakeCloudStoragePort : CloudStoragePort {
        val multipartInits = mutableListOf<CloudStoragePort.MultipartUploadInitRequest>()
        val multipartParts = mutableListOf<CloudStoragePort.MultipartUploadPartRequest>()
        val completedUploads = mutableListOf<CloudStoragePort.MultipartUploadCompleteRequest>()
        val abortedUploads = mutableListOf<CloudStoragePort.MultipartUploadAbortRequest>()
        val objectHeads = mutableMapOf<String, CloudStoragePort.ObjectHead>()
        val objectHeadsOnCompleteFailure = mutableMapOf<String, CloudStoragePort.ObjectHead>()
        val listedObjects = mutableListOf<CloudStoragePort.StoredObjectSummary>()
        val deletedObjectKeys = mutableListOf<String>()
        val failingAbortUploadIds = mutableSetOf<String>()
        val failingPartNumbers = mutableSetOf<Int>()
        val failingCompleteUploadIds = mutableSetOf<String>()
        var failInitiate = false

        override fun upload(request: CloudStoragePort.UploadRequest): CloudStoragePort.UploadResult =
            CloudStoragePort.UploadResult(request.objectKey, "checksum")

        override fun initiateMultipartUpload(
            request: CloudStoragePort.MultipartUploadInitRequest,
        ): CloudStoragePort.MultipartUploadInitResult {
            if (failInitiate) {
                throw IllegalStateException("initiate failed")
            }
            multipartInits += request
            return CloudStoragePort.MultipartUploadInitResult(
                objectKey = request.objectKey,
                uploadId = "upload-${multipartInits.size}",
            )
        }

        override fun uploadMultipartPart(
            request: CloudStoragePort.MultipartUploadPartRequest,
        ): CloudStoragePort.MultipartUploadPartResult {
            if (request.partNumber in failingPartNumbers) {
                throw IllegalStateException("part upload failed")
            }
            multipartParts += request
            return CloudStoragePort.MultipartUploadPartResult(
                partNumber = request.partNumber,
                eTag = "etag-${request.partNumber}",
            )
        }

        override fun completeMultipartUpload(request: CloudStoragePort.MultipartUploadCompleteRequest) {
            if (request.uploadId in failingCompleteUploadIds) {
                objectHeads.putAll(objectHeadsOnCompleteFailure)
                throw IllegalStateException("complete failed")
            }
            completedUploads += request
        }

        override fun abortMultipartUpload(request: CloudStoragePort.MultipartUploadAbortRequest) {
            if (request.uploadId in failingAbortUploadIds) {
                throw IllegalStateException("abort failed")
            }
            abortedUploads += request
        }

        override fun head(objectKey: String): CloudStoragePort.ObjectHead? = objectHeads[objectKey]

        override fun listObjects(
            prefix: String,
            limit: Int,
        ): CloudStoragePort.StoredObjectListing {
            val matched = listedObjects.filter { it.objectKey.startsWith(prefix) }.take(limit.coerceAtLeast(1))
            return CloudStoragePort.StoredObjectListing(
                objects = matched,
                isTruncated = listedObjects.count { it.objectKey.startsWith(prefix) } > matched.size,
            )
        }

        override fun open(objectKey: String): CloudStoragePort.StoredObject? =
            CloudStoragePort.StoredObject(ByteArrayInputStream(ByteArray(0)), "video/mp4", 0, "empty.mp4")

        override fun openRange(
            objectKey: String,
            range: LongRange,
        ): CloudStoragePort.StoredObject? = CloudStoragePort.StoredObject(ByteArrayInputStream(ByteArray(0)), "video/mp4", 0, "empty.mp4")

        override fun delete(objectKey: String) {
            deletedObjectKeys += objectKey
        }
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
