package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.application.port.output.CloudVideoUploadSessionRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.boundedContexts.cloud.model.CloudVideoUploadSession
import com.back.boundedContexts.cloud.model.CloudVideoUploadSessionStatus
import com.back.boundedContexts.cloud.support.InMemoryCloudFileRepository
import com.back.boundedContexts.cloud.support.StubCloudStoragePort
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@DisplayName("CloudFileReconcileService 테스트")
class CloudFileReconcileServiceTest {
    private val clock = Clock.fixed(Instant.parse("2026-07-22T00:00:00Z"), ZoneOffset.UTC)
    private val fileRepository = InMemoryCloudFileRepository()
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
        storage.listedObjects += agedObject(orphanObjectKey)
        fileRepository.save(videoFile(orphanMetaKey))

        val diagnostics = service.diagnose()

        assertThat(diagnostics.repairMode).isEqualTo("dry-run")
        assertThat(diagnostics.bucketOnlyObjectCount).isEqualTo(1)
        assertThat(diagnostics.sampleBucketOnlyObjectKeys).containsExactly(orphanObjectKey)
        assertThat(diagnostics.dbOnlyMissingObjectCount).isEqualTo(1)
        assertThat(diagnostics.sampleDbOnlyObjectKeys).containsExactly(orphanMetaKey)
        assertThat(storage.deletedObjectKeys).isEmpty()
        assertThat(fileRepository.savedFiles.single().deletedAt).isNull()
        assertThat(service.lastRepairSnapshot()).isNull()
    }

    @Test
    @DisplayName("진행 중 세션 objectKey와 grace 안 객체는 고아 객체에서 제외한다")
    fun `진행 중 세션 objectKey와 grace 안 객체는 고아 객체에서 제외한다`() {
        val inFlightKey = "cloud/7/in-flight.mp4"
        val recentKey = "cloud/7/recent.mp4"
        sessionRepository.nonTerminalObjectKeys += inFlightKey
        storage.listedObjects +=
            listOf(
                agedObject(inFlightKey),
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
        storage.listedObjects += listOf(agedObject("cloud/7/a.mp4", size = 1), agedObject("cloud/7/b.mp4", size = 1))
        fileRepository.save(videoFile("cloud/7/missing.mp4", byteSize = 1))

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
        storage.listedObjects += agedObject(orphanObjectKey)
        fileRepository.save(videoFile(orphanMetaKey))

        val diagnostics = service.reconcile(sampleSize = 5, repair = true)

        assertThat(diagnostics.repairMode).isEqualTo("repair")
        assertThat(diagnostics.repairedBucketOnlyDeletedCount).isEqualTo(1)
        assertThat(diagnostics.repairedDbOnlySoftDeletedCount).isEqualTo(1)
        assertThat(storage.deletedObjectKeys).containsExactly(orphanObjectKey)
        assertThat(fileRepository.savedFiles.single { it.objectKey == orphanMetaKey }.deletedAt)
            .isEqualTo(clock.instant())
        assertThat(service.lastRepairSnapshot()).isEqualTo(
            CloudFileReconcileRepairSnapshot(
                repairedBucketOnlyDeletedCount = 1,
                repairedDbOnlySoftDeletedCount = 1,
            ),
        )
    }

    @Test
    @DisplayName("safety threshold를 넘으면 repair를 차단한다")
    fun `safety threshold를 넘으면 repair를 차단한다`() {
        properties.cloudReconcileRepairEnabled = true
        properties.cloudReconcileSafetyThreshold = 1
        storage.listedObjects += listOf(agedObject("cloud/7/a.mp4", size = 1), agedObject("cloud/7/b.mp4", size = 1))

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

    @Test
    @DisplayName("dbRowsTruncated면 bucket-only repair를 차단한다")
    fun `dbRowsTruncated면 bucket-only repair를 차단한다`() {
        properties.cloudReconcileRepairEnabled = true
        properties.cloudReconcileInventoryLimit = 1
        storage.listedObjects += agedObject("cloud/7/orphan-object.mp4")
        repeat(2) { index ->
            fileRepository.save(videoFile("cloud/7/active-$index.mp4"))
        }

        val diagnostics = service.reconcile(sampleSize = 5, repair = true)

        assertThat(diagnostics.dbRowsTruncated).isTrue()
        assertThat(diagnostics.repairMode).isEqualTo("dry-run-blocked")
        assertThat(diagnostics.repairedBucketOnlyDeletedCount).isZero()
        assertThat(storage.deletedObjectKeys).isEmpty()
    }

    @Test
    @DisplayName("in-flight objectKey 조회가 limit에 걸리면 bucket-only repair를 차단한다")
    fun `in-flight objectKey 조회가 limit에 걸리면 bucket-only repair를 차단한다`() {
        properties.cloudReconcileRepairEnabled = true
        properties.cloudReconcileInventoryLimit = 1
        sessionRepository.nonTerminalObjectKeys += listOf("cloud/7/in-flight-a.mp4", "cloud/7/in-flight-b.mp4")
        storage.listedObjects += agedObject("cloud/7/orphan-object.mp4")

        val diagnostics = service.reconcile(sampleSize = 5, repair = true)

        assertThat(diagnostics.repairMode).isEqualTo("dry-run-blocked")
        assertThat(diagnostics.repairedBucketOnlyDeletedCount).isZero()
        assertThat(storage.deletedObjectKeys).isEmpty()
    }

    @Test
    @DisplayName("bucket delete 실패는 카운트하지 않고 계속 진행한다")
    fun `bucket delete 실패는 카운트하지 않고 계속 진행한다`() {
        properties.cloudReconcileRepairEnabled = true
        storage.failDeleteObjectKeys += "cloud/7/orphan-object.mp4"
        storage.listedObjects += agedObject("cloud/7/orphan-object.mp4")

        val diagnostics = service.reconcile(sampleSize = 5, repair = true)

        assertThat(diagnostics.repairMode).isEqualTo("repair")
        assertThat(diagnostics.repairedBucketOnlyDeletedCount).isZero()
    }

    @Test
    @DisplayName("db-only soft-delete 실패는 카운트하지 않고 계속 진행한다")
    fun `db-only soft-delete 실패는 카운트하지 않고 계속 진행한다`() {
        properties.cloudReconcileRepairEnabled = true
        fileRepository.save(videoFile("cloud/7/orphan-meta.mp4"))
        fileRepository.failSave = true

        val diagnostics = service.reconcile(sampleSize = 5, repair = true)

        assertThat(diagnostics.repairMode).isEqualTo("repair")
        assertThat(diagnostics.repairedDbOnlySoftDeletedCount).isZero()
    }

    @Test
    @DisplayName("blank cloudKeyPrefix는 cloud로 정규화한다")
    fun `blank cloudKeyPrefix는 cloud로 정규화한다`() {
        properties.cloudKeyPrefix = "   "

        val diagnostics = service.diagnose()

        assertThat(diagnostics.objectPrefix).isEqualTo("cloud/")
    }

    @Test
    @DisplayName("기본 clock 생성자로 diagnose를 실행할 수 있다")
    fun `기본 clock 생성자로 diagnose를 실행할 수 있다`() {
        val defaultClockService =
            CloudFileReconcileService(
                cloudStoragePort = storage,
                cloudFileRepository = fileRepository,
                sessionRepository = sessionRepository,
                cloudStorageProperties = properties,
            )

        val diagnostics = defaultClockService.diagnose()

        assertThat(diagnostics.repairMode).isEqualTo("dry-run")
    }

    @Test
    @DisplayName("dbRowsTruncated여도 inventory가 완전하면 db-only soft-delete는 허용한다")
    fun `dbRowsTruncated여도 inventory가 완전하면 db-only soft-delete는 허용한다`() {
        properties.cloudReconcileRepairEnabled = true
        properties.cloudReconcileInventoryLimit = 1
        fileRepository.save(videoFile("cloud/7/orphan-meta.mp4"))
        fileRepository.save(videoFile("cloud/7/active-extra.mp4"))
        storage.listedObjects += agedObject("cloud/7/bucket-orphan.mp4")

        val diagnostics = service.reconcile(sampleSize = 5, repair = true)

        assertThat(diagnostics.dbRowsTruncated).isTrue()
        assertThat(diagnostics.inventoryTruncated).isFalse()
        assertThat(diagnostics.repairMode).isEqualTo("dry-run-blocked")
        assertThat(diagnostics.repairedBucketOnlyDeletedCount).isZero()
        assertThat(storage.deletedObjectKeys).isEmpty()
        assertThat(diagnostics.repairedDbOnlySoftDeletedCount).isEqualTo(1)
        assertThat(fileRepository.savedFiles.single { it.objectKey == "cloud/7/orphan-meta.mp4" }.deletedAt)
            .isEqualTo(clock.instant())
    }

    @Test
    @DisplayName("grace 안의 최근 생성된 DB 메타는 고아 메타 진단과 repair에서 제외한다")
    fun `grace 안의 최근 생성된 DB 메타는 고아 메타 진단과 repair에서 제외한다`() {
        properties.cloudReconcileRepairEnabled = true
        val recentMetaKey = "cloud/7/recent-meta.mp4"
        val agedMetaKey = "cloud/7/aged-meta.mp4"
        fileRepository.save(
            videoFile(recentMetaKey).apply {
                createdAt = Instant.parse("2026-07-21T12:00:00Z")
                modifiedAt = Instant.parse("2026-07-21T12:00:00Z")
            },
        )
        fileRepository.save(
            videoFile(agedMetaKey).apply {
                createdAt = Instant.parse("2026-07-20T00:00:00Z")
                modifiedAt = Instant.parse("2026-07-20T00:00:00Z")
            },
        )

        val diagnostics = service.reconcile(sampleSize = 5, repair = true)

        assertThat(diagnostics.dbOnlyMissingObjectCount).isEqualTo(1)
        assertThat(diagnostics.sampleDbOnlyObjectKeys).containsExactly(agedMetaKey)
        assertThat(diagnostics.repairedDbOnlySoftDeletedCount).isEqualTo(1)
        assertThat(fileRepository.savedFiles.single { it.objectKey == recentMetaKey }.deletedAt).isNull()
        assertThat(fileRepository.savedFiles.single { it.objectKey == agedMetaKey }.deletedAt).isEqualTo(clock.instant())
    }

    private fun videoFile(
        objectKey: String,
        byteSize: Long = 10,
    ): CloudFile {
        val filename = objectKey.substringAfterLast('/')
        return CloudFile.create(
            ownerMemberId = 7L,
            objectKey = objectKey,
            originalFilename = filename,
            contentType = "video/mp4",
            byteSize = byteSize,
            mediaKind = CloudFileMediaKind.VIDEO,
            folderPath = "",
            checksumSha256 = null,
        )
    }

    private fun agedObject(
        objectKey: String,
        size: Long = 10,
    ): CloudStoragePort.StoredObjectSummary =
        CloudStoragePort.StoredObjectSummary(
            objectKey = objectKey,
            size = size,
            lastModified = Instant.parse("2026-07-20T00:00:00Z"),
        )

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

    private class FakeCloudStoragePort : StubCloudStoragePort() {
        val listedObjects = mutableListOf<CloudStoragePort.StoredObjectSummary>()
        val deletedObjectKeys = mutableListOf<String>()
        val failDeleteObjectKeys = mutableSetOf<String>()
        var failListObjects = false

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
            if (objectKey in failDeleteObjectKeys) {
                throw IllegalStateException("delete failed")
            }
            deletedObjectKeys += objectKey
        }
    }
}
