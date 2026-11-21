package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.adapter.web.ApiV1PublicCloudController
import com.back.boundedContexts.cloud.application.port.output.CloudExternalPlaybackTokenRepositoryPort
import com.back.boundedContexts.cloud.model.CloudExternalPlaybackToken
import com.back.boundedContexts.cloud.model.CloudExternalPlaybackTokenPurpose
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.boundedContexts.cloud.support.InMemoryCloudFileRepository
import com.back.boundedContexts.cloud.support.StubCloudStoragePort
import com.back.global.exception.application.AppException
import com.back.global.storage.application.port.output.CloudStoragePort
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.io.ByteArrayInputStream
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@DisplayName("CloudExternalPlaybackTokenService 테스트")
class CloudExternalPlaybackTokenServiceTest {
    private val clock = Clock.fixed(Instant.parse("2026-06-26T12:00:00Z"), ZoneOffset.UTC)
    private val files = InMemoryCloudFileRepository()
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
    @DisplayName("관리자 본인 동영상 파일에 대해 6시간 TTL raw token을 반환하고 hash만 저장한다")
    fun issueStoresHashOnly() {
        files.savedFiles += videoFile(id = 12L, ownerMemberId = 7L)

        val issued = service.issue(ownerMemberId = 7L, fileId = 12L)

        assertThat(issued.fileId).isEqualTo(12L)
        assertThat(issued.token).isNotBlank()
        assertThat(issued.expiresAt).isEqualTo(Instant.parse("2026-06-26T18:00:00Z"))
        assertThat(issued.contentPath)
            .startsWith("/system/api/v1/public/cloud/files/12/playback?token=")
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
        tokens.savedTokens += playbackToken(expiredToken, fileId = 12L, expiresAt = Instant.parse("2026-06-26T11:59:59Z"))

        assertThatThrownBy { service.openContentRange(token = expiredToken, fileId = 12L, range = 0L..4L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("외부 재생 token이 올바르지 않거나 만료되었습니다.")

        assertThat(storage.openedRanges).isEmpty()
    }

    @Test
    @DisplayName("유효 token이어도 파일이 없으면 denied 메트릭 경로로 거절한다")
    fun validTokenDeniesMissingFile() {
        val issuedToken = "missing-file-token"
        tokens.savedTokens += playbackToken(issuedToken, fileId = 12L, expiresAt = Instant.parse("2026-06-26T18:00:00Z"))

        assertThatThrownBy { service.openContent(token = issuedToken, fileId = 12L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("클라우드 파일")
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

    @Test
    @DisplayName("만료 token 정리는 grace를 지난 행만 배치 삭제한다")
    fun purgeExpiredTokensDeletesPastGraceOnly() {
        tokens.savedTokens +=
            listOf(
                playbackToken("past-grace", fileId = 12L, expiresAt = Instant.parse("2026-06-26T10:00:00Z")),
                playbackToken("inside-grace", fileId = 13L, expiresAt = Instant.parse("2026-06-26T11:30:00Z")),
                playbackToken("still-valid", fileId = 14L, expiresAt = Instant.parse("2026-06-26T18:00:00Z")),
            )

        val purgedCount = service.purgeExpiredTokens(batchSize = 100)

        assertThat(purgedCount).isEqualTo(1)
        assertThat(tokens.savedTokens.map { it.fileId }).containsExactly(13L, 14L)
    }

    @Test
    @DisplayName("listActiveTokens는 만료되지 않은 토큰 목록을 반환한다")
    fun listActiveTokensReturnsNonExpiredOnly() {
        files.savedFiles += videoFile(id = 12L, ownerMemberId = 7L)
        val validToken = playbackToken("valid", fileId = 12L, expiresAt = Instant.parse("2026-06-26T18:00:00Z"))
        val expiredToken = playbackToken("expired", fileId = 12L, expiresAt = Instant.parse("2026-06-26T10:00:00Z"))
        tokens.savedTokens += listOf(validToken, expiredToken)

        val list = service.listActiveTokens(ownerMemberId = 7L, fileId = 12L)

        assertThat(list).hasSize(1)
        assertThat(list.first().fileId).isEqualTo(12L)
        assertThat(list.first().expiresAt).isEqualTo(Instant.parse("2026-06-26T18:00:00Z"))
    }

    @Test
    @DisplayName("revokeToken은 특정 토큰을 즉시 삭제한다")
    fun revokeTokenRemovesMatchingToken() {
        files.savedFiles += videoFile(id = 12L, ownerMemberId = 7L)
        val token = playbackToken("to-revoke", fileId = 12L, expiresAt = Instant.parse("2026-06-26T18:00:00Z"))
        tokens.savedTokens += token

        service.revokeToken(ownerMemberId = 7L, fileId = 12L, tokenId = token.id)

        assertThat(tokens.savedTokens).isEmpty()

        assertThatThrownBy { service.revokeToken(ownerMemberId = 7L, fileId = 12L, tokenId = 999L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("외부 재생 token을 찾을 수 없습니다.")
    }

    @Test
    @DisplayName("revokeAllTokens는 파일의 모든 토큰을 삭제하고 건수를 반환한다")
    fun revokeAllTokensRemovesAllForFile() {
        files.savedFiles += videoFile(id = 12L, ownerMemberId = 7L)
        tokens.savedTokens +=
            listOf(
                playbackToken("t1", fileId = 12L, expiresAt = Instant.parse("2026-06-26T18:00:00Z")),
                playbackToken("t2", fileId = 12L, expiresAt = Instant.parse("2026-06-26T19:00:00Z")),
                playbackToken("other-file", fileId = 13L, expiresAt = Instant.parse("2026-06-26T18:00:00Z")),
            )

        val revokedCount = service.revokeAllTokens(ownerMemberId = 7L, fileId = 12L)

        assertThat(revokedCount).isEqualTo(2)
        assertThat(tokens.savedTokens.map { it.fileId }).containsExactly(13L)
    }

    @Test
    @DisplayName("비디오 파일이 아니면 토큰 목록 조회와 폐기가 400으로 거부된다")
    fun rejectsNonVideoFileForTokenManagement() {
        files.savedFiles += documentFile(id = 12L, ownerMemberId = 7L)

        assertThatThrownBy { service.listActiveTokens(ownerMemberId = 7L, fileId = 12L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("동영상 파일만 외부 재생할 수 있습니다.")

        assertThatThrownBy { service.revokeToken(ownerMemberId = 7L, fileId = 12L, tokenId = 1L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("동영상 파일만 외부 재생할 수 있습니다.")

        assertThatThrownBy { service.revokeAllTokens(ownerMemberId = 7L, fileId = 12L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("동영상 파일만 외부 재생할 수 있습니다.")
    }

    @Test
    @DisplayName("외부 재생 컨트롤러와 스트리밍 서비스 메서드는 DB 트랜잭션 경계 밖에서 스토리지 I/O를 연다")
    fun playbackStreamingMethodsDoNotDeclareTransactionalOrHoldActiveTransactionDuringStorageIo() {
        val controllerMethods =
            ApiV1PublicCloudController::class.java.declaredMethods.filter {
                it.name == "playback" || it.name == "playbackHead"
            }
        assertThat(controllerMethods).hasSize(2)
        controllerMethods.forEach { method ->
            assertThat(method.isAnnotationPresent(Transactional::class.java))
                .withFailMessage("Controller method %s must not declare @Transactional", method.name)
                .isFalse()
        }

        val streamingMethods =
            CloudExternalPlaybackTokenService::class.java.declaredMethods.filter {
                it.name == "openContent" || it.name == "openContentRange"
            }
        assertThat(streamingMethods).hasSize(3)
        streamingMethods.forEach { method ->
            assertThat(method.isAnnotationPresent(Transactional::class.java))
                .withFailMessage("Streaming method %s must not declare @Transactional", method.name)
                .isFalse()
        }

        val file = videoFile(id = 12L, ownerMemberId = 7L)
        files.savedFiles += file
        storage.objects[file.objectKey] =
            CloudStoragePort.StoredObject(ByteArrayInputStream(byteArrayOf(1, 2, 3)), "video/mp4", 3L, "clip.mp4")
        val issued = service.issue(7L, 12L)

        service
            .openContent(issued.token, 12L)
            .storedObject
            .inputStream
            .close()
        service
            .openContentRange(issued.token, 12L, 0L..1L)
            .storedObject
            .inputStream
            .close()
        assertThat(storage.sawActiveTransaction).isZero()

        val events = mutableListOf<String>()
        val txManager =
            object : PlatformTransactionManager {
                override fun getTransaction(definition: TransactionDefinition?): TransactionStatus {
                    events += "tx-begin(readOnly=${definition?.isReadOnly})"
                    return SimpleTransactionStatus()
                }

                override fun commit(status: TransactionStatus) {
                    events += "tx-commit"
                }

                override fun rollback(status: TransactionStatus) {
                    events += "tx-rollback"
                }
            }
        val recordingStorage =
            object : StubCloudStoragePort() {
                override fun open(objectKey: String): CloudStoragePort.StoredObject? {
                    events += "storage-open"
                    return CloudStoragePort.StoredObject(ByteArrayInputStream(byteArrayOf(1)), "video/mp4", 1L, "clip.mp4")
                }

                override fun openRange(
                    objectKey: String,
                    range: LongRange,
                ): CloudStoragePort.StoredObject? {
                    events += "storage-open-range"
                    return CloudStoragePort.StoredObject(ByteArrayInputStream(byteArrayOf(1)), "video/mp4", 1L, "clip.mp4")
                }
            }
        val txService =
            CloudExternalPlaybackTokenService(
                cloudFileRepository = files,
                cloudExternalPlaybackTokenRepository = tokens,
                cloudStoragePort = recordingStorage,
                clock = clock,
                transactionManager = txManager,
            )

        txService
            .openContent(issued.token, 12L)
            .storedObject
            .inputStream
            .close()
        txService
            .openContentRange(issued.token, 12L, 0L..0L)
            .storedObject
            .inputStream
            .close()
        assertThat(events).containsExactly(
            "tx-begin(readOnly=true)",
            "tx-commit",
            "storage-open",
            "tx-begin(readOnly=true)",
            "tx-commit",
            "storage-open-range",
        )
    }

    private fun playbackToken(
        rawToken: String,
        fileId: Long,
        expiresAt: Instant,
        memberId: Long = 7L,
    ): CloudExternalPlaybackToken =
        CloudExternalPlaybackToken
            .create(
                tokenHash = CloudExternalPlaybackTokenService.hashToken(rawToken),
                fileId = fileId,
                memberId = memberId,
                purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                expiresAt = expiresAt,
            ).apply {
                createdAt = Instant.parse("2026-06-26T00:00:00Z")
                modifiedAt = Instant.parse("2026-06-26T00:00:00Z")
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

        override fun findActiveByFileId(
            fileId: Long,
            now: Instant,
        ): List<CloudExternalPlaybackToken> =
            savedTokens
                .filter { it.fileId == fileId && it.expiresAt.isAfter(now) }
                .sortedWith(compareByDescending<CloudExternalPlaybackToken> { it.createdAt }.thenByDescending { it.id })

        override fun deleteByIdAndFileIdAndMemberId(
            id: Long,
            fileId: Long,
            memberId: Long,
        ): Int {
            val toRemove = savedTokens.filter { it.id == id && it.fileId == fileId && it.memberId == memberId }
            savedTokens.removeAll(toRemove.toSet())
            return toRemove.size
        }

        override fun deleteByFileIdAndMemberId(
            fileId: Long,
            memberId: Long,
        ): Int {
            val toRemove = savedTokens.filter { it.fileId == fileId && it.memberId == memberId }
            savedTokens.removeAll(toRemove.toSet())
            return toRemove.size
        }

        override fun deleteByExpiresAtBefore(
            cutoff: Instant,
            limit: Int,
        ): Int {
            val toDelete =
                savedTokens
                    .filter { it.expiresAt.isBefore(cutoff) }
                    .sortedWith(compareBy({ it.expiresAt }, { it.id }))
                    .take(limit.coerceAtLeast(1))
            savedTokens.removeAll(toDelete.toSet())
            return toDelete.size
        }
    }

    private class FakeCloudStoragePort : StubCloudStoragePort() {
        val openedObjects = mutableListOf<String>()
        val openedRanges = mutableListOf<Pair<String, LongRange>>()
        val objects = mutableMapOf<String, CloudStoragePort.StoredObject>()
        var sawActiveTransaction = 0

        override fun open(objectKey: String): CloudStoragePort.StoredObject? {
            if (TransactionSynchronizationManager.isActualTransactionActive()) {
                sawActiveTransaction++
            }
            openedObjects += objectKey
            return objects[objectKey]
        }

        override fun openRange(
            objectKey: String,
            range: LongRange,
        ): CloudStoragePort.StoredObject? {
            if (TransactionSynchronizationManager.isActualTransactionActive()) {
                sawActiveTransaction++
            }
            openedRanges += objectKey to range
            return objects[objectKey]
        }
    }
}
