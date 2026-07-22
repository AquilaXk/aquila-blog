package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.application.port.output.CloudVideoUploadSessionRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.boundedContexts.cloud.model.CloudVideoUploadSession
import com.back.boundedContexts.cloud.model.CloudVideoUploadSessionStatus
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@DisplayName("CloudFileReconcileService 테스트")
class CloudFileReconcileServiceTest {
    private val clock = Clock.fixed(Instant.parse("2026-07-22T00:00:00Z"), ZoneOffset.UTC)
    private val fileRepository = FakeCloudFileRepository()
    private val sessionRepository = FakeCloudVideoUploadSessionRepository()
    private val storage = FakeCloudStoragePort()
    private val properties =
        CloudStorageProperties(
            cloudKeyPrefix = "cloud",
            cloudReconcileInventoryLimit = 100,
            cloudReconcileObjectGraceSeconds = 24L * 60 * 60,
            cloudReconcileSafetyThreshold = 25,
            cloudReconcileRepairEnabled = false,
        )

    private val service =
        CloudFileReconcileService(
            cloudStoragePort = storage,
            cloudFileRepository = fileRepository,
            sessionRepository = sessionRepository,
            cloudStorageProperties = properties,
            clock = clock,
        )

    @Test
    @DisplayName("grace가 지난 고아 객체와 고아 메타를 dry-run으로 감지한다")
    fun `grace가 지난 고아 객체와 고아 메타를 dry-run으로 감지한다`() {
        val orphanObjectKey = "cloud/7/orphan-object.mp4"
        val orphanMetaKey = "cloud/7/orphan-meta.mp4"
        storage.listedObjects +=
            CloudStoragePort.StoredObjectSummary(
                objectKey = orphanObjectKey,
                size = 10,
                lastModified = Instant.parse("2026-07-20T00:00:00Z"),
            )
        fileRepository.save(
            CloudFile.create(
                ownerMemberId = 7L,
                objectKey = orphanMetaKey,
                originalFilename = "orphan-meta.mp4",
                contentType = "video/mp4",
                byteSize = 10,
                mediaKind = CloudFileMediaKind.VIDEO,
                folderPath = "",
                checksumSha256 = null,
            ),
        )

        val diagnostics = service.diagnose()

        assertThat(diagnostics.repairMode).isEqualTo("dry-run")
        assertThat(diagnostics.bucketOnlyObjectCount).isEqualTo(1)
        assertThat(diagnostics.sampleBucketOnlyObjectKeys).containsExactly(orphanObjectKey)
        assertThat(diagnostics.dbOnlyMissingObjectCount).isEqualTo(1)
        assertThat(diagnostics.sampleDbOnlyObjectKeys).containsExactly(orphanMetaKey)
        assertThat(storage.deletedObjectKeys).isEmpty()
        assertThat(fileRepository.savedFiles.single().deletedAt).isNull()
    }

    @Test
    @DisplayName("진행 중 세션 objectKey와 grace 안 객체는 고아 객체에서 제외한다")
    fun `진행 중 세션 objectKey와 grace 안 객체는 고아 객체에서 제외한다`() {
        val inFlightKey = "cloud/7/in-flight.mp4"
        val recentKey = "cloud/7/recent.mp4"
        sessionRepository.nonTerminalObjectKeys += inFlightKey
        storage.listedObjects +=
            listOf(
                CloudStoragePort.StoredObjectSummary(
                    objectKey = inFlightKey,
                    size = 10,
                    lastModified = Instant.parse("2026-07-20T00:00:00Z"),
                ),
                CloudStoragePort.StoredObjectSummary(
                    objectKey = recentKey,
                    size = 10,
                    lastModified = Instant.parse("2026-07-21T12:00:00Z"),
                ),
            )

        val diagnostics = service.diagnose()

        assertThat(diagnostics.bucketOnlyObjectCount).isZero()
        assertThat(diagnostics.sampleBucketOnlyObjectKeys).isEmpty()
    }

    @Test
    @DisplayName("inventory truncate면 고아 메타를 판정하지 않는다")
    fun `inventory truncate면 고아 메타를 판정하지 않는다`() {
        properties.cloudReconcileInventoryLimit = 1
        storage.listedObjects +=
            listOf(
                CloudStoragePort.StoredObjectSummary(
                    objectKey = "cloud/7/a.mp4",
                    size = 1,
                    lastModified = Instant.parse("2026-07-20T00:00:00Z"),
                ),
                CloudStoragePort.StoredObjectSummary(
                    objectKey = "cloud/7/b.mp4",
                    size = 1,
                    lastModified = Instant.parse("2026-07-20T00:00:00Z"),
                ),
            )
        fileRepository.save(
            CloudFile.create(
                ownerMemberId = 7L,
                objectKey = "cloud/7/missing.mp4",
                originalFilename = "missing.mp4",
                contentType = "video/mp4",
                byteSize = 1,
                mediaKind = CloudFileMediaKind.VIDEO,
                folderPath = "",
                checksumSha256 = null,
            ),
        )

        val diagnostics = service.diagnose()

        assertThat(diagnostics.inventoryTruncated).isTrue()
        assertThat(diagnostics.dbOnlyMissingObjectCount).isZero()
    }

    @Test
    @DisplayName("repair 모드에서는 고아 객체를 삭제하고 고아 메타를 soft-delete한다")
    fun `repair 모드에서는 고아 객체를 삭제하고 고아 메타를 soft-delete한다`() {
        properties.cloudReconcileRepairEnabled = true
        val orphanObjectKey = "cloud/7/orphan-object.mp4"
        val orphanMetaKey = "cloud/7/orphan-meta.mp4"
        storage.listedObjects +=
            CloudStoragePort.StoredObjectSummary(
                objectKey = orphanObjectKey,
                size = 10,
                lastModified = Instant.parse("2026-07-20T00:00:00Z"),
            )
        fileRepository.save(
            CloudFile.create(
                ownerMemberId = 7L,
                objectKey = orphanMetaKey,
                originalFilename = "orphan-meta.mp4",
                contentType = "video/mp4",
                byteSize = 10,
                mediaKind = CloudFileMediaKind.VIDEO,
                folderPath = "",
                checksumSha256 = null,
            ),
        )

        val diagnostics = service.reconcile(sampleSize = 5, repair = true)

        assertThat(diagnostics.repairMode).isEqualTo("repair")
        assertThat(diagnostics.repairedBucketOnlyDeletedCount).isEqualTo(1)
        assertThat(diagnostics.repairedDbOnlySoftDeletedCount).isEqualTo(1)
        assertThat(storage.deletedObjectKeys).containsExactly(orphanObjectKey)
        assertThat(fileRepository.savedFiles.single { it.objectKey == orphanMetaKey }.deletedAt)
            .isEqualTo(clock.instant())
    }

    @Test
    @DisplayName("safety threshold를 넘으면 repair를 차단한다")
    fun `safety threshold를 넘으면 repair를 차단한다`() {
        properties.cloudReconcileRepairEnabled = true
        properties.cloudReconcileSafetyThreshold = 1
        storage.listedObjects +=
            listOf(
                CloudStoragePort.StoredObjectSummary(
                    objectKey = "cloud/7/a.mp4",
                    size = 1,
                    lastModified = Instant.parse("2026-07-20T00:00:00Z"),
                ),
                CloudStoragePort.StoredObjectSummary(
                    objectKey = "cloud/7/b.mp4",
                    size = 1,
                    lastModified = Instant.parse("2026-07-20T00:00:00Z"),
                ),
            )

        val diagnostics = service.reconcile(sampleSize = 5, repair = true)

        assertThat(diagnostics.repairMode).isEqualTo("dry-run-blocked")
        assertThat(diagnostics.blockedBySafetyThreshold).isTrue()
        assertThat(diagnostics.repairedBucketOnlyDeletedCount).isZero()
        assertThat(storage.deletedObjectKeys).isEmpty()
    }

    @Test
    @DisplayName("listObjects 실패 시 degraded diagnostics를 반환한다")
    fun `listObjects 실패 시 degraded diagnostics를 반환한다`() {
        storage.failListObjects = true

        val diagnostics = service.diagnose()

        assertThat(diagnostics.inventoryAvailable).isFalse()
        assertThat(diagnostics.repairMode).isEqualTo("dry-run-degraded")
        assertThat(diagnostics.bucketOnlyObjectCount).isZero()
        assertThat(diagnostics.dbOnlyMissingObjectCount).isZero()
    }

    private class FakeCloudFileRepository : CloudFileRepositoryPort {
        val savedFiles = mutableListOf<CloudFile>()
        private var nextId = 1L

        override fun save(file: CloudFile): CloudFile {
            val stored =
                if (file.id == 0L) {
                    CloudFile
                        .create(
                            id = nextId++,
                            ownerMemberId = file.ownerMemberId,
                            objectKey = file.objectKey,
                            originalFilename = file.originalFilename,
                            contentType = file.contentType,
                            byteSize = file.byteSize,
                            mediaKind = file.mediaKind,
                            folderPath = file.folderPath,
                            checksumSha256 = file.checksumSha256,
                        ).also { it.deletedAt = file.deletedAt }
                } else {
                    file
                }
            savedFiles.removeIf { it.id == stored.id || it.objectKey == stored.objectKey }
            savedFiles += stored
            return stored
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

        override fun findActiveByObjectKey(objectKey: String): CloudFile? =
            savedFiles.firstOrNull { it.objectKey == objectKey && it.deletedAt == null }

        override fun findActiveByObjectKeyStartingWith(
            objectKeyPrefix: String,
            limit: Int,
        ): List<CloudFile> =
            savedFiles
                .filter { it.deletedAt == null && it.objectKey.startsWith(objectKeyPrefix) }
                .sortedBy { it.id }
                .take(limit.coerceAtLeast(1))
    }

    private class FakeCloudVideoUploadSessionRepository : CloudVideoUploadSessionRepositoryPort {
        val nonTerminalObjectKeys = mutableListOf<String>()

        override fun save(session: CloudVideoUploadSession): CloudVideoUploadSession = session

        override fun findByIdAndOwner(
            id: Long,
            ownerMemberId: Long,
        ): CloudVideoUploadSession? = null

        override fun findExpiredInProgress(
            now: Instant,
            limit: Int,
        ): List<CloudVideoUploadSession> = emptyList()

        override fun findStaleIntermediate(
            initiatingCutoff: Instant,
            completingOrAbortingCutoff: Instant,
            uploadingPartCutoff: Instant,
            limit: Int,
        ): List<CloudVideoUploadSession> = emptyList()

        override fun countStaleIntermediate(
            initiatingCutoff: Instant,
            completingOrAbortingCutoff: Instant,
            uploadingPartCutoff: Instant,
        ): Long = 0

        override fun findNonTerminalObjectKeysByPrefix(
            objectKeyPrefix: String,
            limit: Int,
        ): List<String> =
            nonTerminalObjectKeys
                .filter { it.startsWith(objectKeyPrefix) }
                .take(limit.coerceAtLeast(1))

        override fun attachUploadIdAndTransition(
            id: Long,
            expectedStatus: CloudVideoUploadSessionStatus,
            uploadId: String,
            nextStatus: CloudVideoUploadSessionStatus,
            now: Instant,
        ): Int = 0

        override fun transitionStatus(
            id: Long,
            expectedStatus: CloudVideoUploadSessionStatus,
            nextStatus: CloudVideoUploadSessionStatus,
            now: Instant,
        ): Int = 0

        override fun markFailed(
            id: Long,
            expectedStatus: CloudVideoUploadSessionStatus,
            reason: String,
            now: Instant,
        ): Int = 0

        override fun extendExpiresAt(
            id: Long,
            newExpiresAt: Instant,
            now: Instant,
        ): Int = 0
    }

    private class FakeCloudStoragePort : CloudStoragePort {
        val listedObjects = mutableListOf<CloudStoragePort.StoredObjectSummary>()
        val deletedObjectKeys = mutableListOf<String>()
        var failListObjects = false

        override fun upload(request: CloudStoragePort.UploadRequest): CloudStoragePort.UploadResult =
            CloudStoragePort.UploadResult(request.objectKey, "checksum")

        override fun initiateMultipartUpload(
            request: CloudStoragePort.MultipartUploadInitRequest,
        ): CloudStoragePort.MultipartUploadInitResult = CloudStoragePort.MultipartUploadInitResult(request.objectKey, "upload-1")

        override fun uploadMultipartPart(
            request: CloudStoragePort.MultipartUploadPartRequest,
        ): CloudStoragePort.MultipartUploadPartResult = CloudStoragePort.MultipartUploadPartResult(request.partNumber, "etag")

        override fun completeMultipartUpload(request: CloudStoragePort.MultipartUploadCompleteRequest) = Unit

        override fun abortMultipartUpload(request: CloudStoragePort.MultipartUploadAbortRequest) = Unit

        override fun head(objectKey: String): CloudStoragePort.ObjectHead? = null

        override fun listObjects(
            prefix: String,
            limit: Int,
        ): CloudStoragePort.StoredObjectListing {
            if (failListObjects) {
                throw IllegalStateException("list failed")
            }
            val matched = listedObjects.filter { it.objectKey.startsWith(prefix) }.take(limit.coerceAtLeast(1))
            return CloudStoragePort.StoredObjectListing(
                objects = matched,
                isTruncated = listedObjects.count { it.objectKey.startsWith(prefix) } > matched.size,
            )
        }

        override fun open(objectKey: String): CloudStoragePort.StoredObject? =
            CloudStoragePort.StoredObject(emptyStream(), "video/mp4", 0, "empty.mp4")

        override fun openRange(
            objectKey: String,
            range: LongRange,
        ): CloudStoragePort.StoredObject? = CloudStoragePort.StoredObject(emptyStream(), "video/mp4", 0, "empty.mp4")

        override fun delete(objectKey: String) {
            deletedObjectKeys += objectKey
        }

        private fun emptyStream(): InputStream = ByteArrayInputStream(ByteArray(0))
    }
}
