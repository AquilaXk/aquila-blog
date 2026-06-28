package com.back.global.storage.application

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.jpa.application.ProdSequenceGuardService
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileStatus
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class UploadedFileRetentionServiceConflictRecoveryTest {
    private val postRepository = mock(PostRepositoryPort::class.java)
    private val memberAttrRepository = mock(MemberAttrRepositoryPort::class.java)
    private val postImageStoragePort = mock(PostImageStoragePort::class.java)
    private val prodSequenceGuardService = mock(ProdSequenceGuardService::class.java)
    private val transactionManager = NoopTransactionManager()
    private val clock = Clock.fixed(Instant.parse("2026-06-19T00:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `registerTempUpload은 sequence drift 충돌 시 같은 요청에서 보정 후 재시도한다`() {
        val conflict = DataIntegrityViolationException("duplicate key value violates unique constraint \"uploaded_file_pkey\"")
        val repository = SequenceDriftRecoveringRepository(conflict)
        `when`(prodSequenceGuardService.repairIfSequenceDrift(conflict)).thenReturn(true)

        val service = newService(repository)

        assertDoesNotThrow {
            service.registerTempUpload(
                objectKey = "posts/2026/03/recovered.png",
                contentType = "image/png",
                fileSize = 256,
                purpose = UploadedFilePurpose.POST_IMAGE,
            )
        }

        assertThat(repository.saveCallCount).isEqualTo(2)
        assertThat(repository.flushCallCount).isEqualTo(1)
        assertThat(repository.findByObjectKey("posts/2026/03/recovered.png")).isNotNull
        verify(prodSequenceGuardService).repairIfSequenceDrift(conflict)
    }

    @Test
    fun `registerTempUpload은 object key 충돌 시 기존 row를 재사용하고 sequence 보정은 호출하지 않는다`() {
        val repository = ExistingObjectKeyRecoveringRepository()
        val service = newService(repository)

        assertDoesNotThrow {
            service.registerTempUpload(
                objectKey = "posts/2026/03/existing.png",
                contentType = "image/webp",
                fileSize = 512,
                purpose = UploadedFilePurpose.POST_IMAGE,
            )
        }

        assertThat(repository.saveCallCount).isEqualTo(2)
        assertThat(repository.flushCallCount).isEqualTo(1)
        assertThat(repository.findByObjectKey("posts/2026/03/existing.png")?.status).isEqualTo(UploadedFileStatus.TEMP)
        verifyNoInteractions(prodSequenceGuardService)
    }

    @Test
    fun `registerTempUpload은 제약명 파싱 실패 시 uploaded_file 전용 sequence fallback으로 복구한다`() {
        val conflict = DataIntegrityViolationException("중복 키 값이 존재합니다.")
        val repository = SequenceDriftRecoveringRepository(conflict)
        `when`(prodSequenceGuardService.repairIfSequenceDrift(conflict)).thenReturn(false)
        `when`(prodSequenceGuardService.repairUploadedFileSequence()).thenReturn(true)

        val service = newService(repository)

        assertDoesNotThrow {
            service.registerTempUpload(
                objectKey = "posts/2026/03/fallback.png",
                contentType = "image/png",
                fileSize = 1024,
                purpose = UploadedFilePurpose.POST_IMAGE,
            )
        }

        assertThat(repository.saveCallCount).isEqualTo(2)
        assertThat(repository.findByObjectKey("posts/2026/03/fallback.png")).isNotNull
        verify(prodSequenceGuardService).repairIfSequenceDrift(conflict)
        verify(prodSequenceGuardService).repairUploadedFileSequence()
    }

    @Test
    fun `registerTempUploadWithCompensation은 POST_IMAGE 등록 실패 시 업로드 이미지를 삭제한다`() {
        val failure = IllegalStateException("temp row save failed")
        val service = newService(AlwaysFailingRepository(failure))

        assertThatThrownBy {
            service.registerTempUploadWithCompensation(
                objectKey = "posts/2026/03/orphan.png",
                contentType = "image/png",
                fileSize = 256,
                purpose = UploadedFilePurpose.POST_IMAGE,
            )
        }.isSameAs(failure)

        verify(postImageStoragePort).deletePostImage("posts/2026/03/orphan.png")
    }

    @Test
    fun `registerTempUploadWithCompensation은 등록 성공 시 보상 삭제를 호출하지 않는다`() {
        val repository = SuccessfulRepository()
        val service = newService(repository)

        assertDoesNotThrow {
            service.registerTempUploadWithCompensation(
                objectKey = "posts/2026/03/success.png",
                contentType = "image/png",
                fileSize = 128,
                purpose = UploadedFilePurpose.POST_IMAGE,
            )
        }

        assertThat(repository.findByObjectKey("posts/2026/03/success.png")).isNotNull
        verifyNoInteractions(postImageStoragePort)
    }

    @Test
    fun `registerTempUploadWithCompensation은 POST_FILE 등록 실패 시 업로드 파일을 삭제한다`() {
        val failure = IllegalStateException("temp row save failed")
        val service = newService(AlwaysFailingRepository(failure))

        assertThatThrownBy {
            service.registerTempUploadWithCompensation(
                objectKey = "posts/2026/03/orphan.pdf",
                contentType = "application/pdf",
                fileSize = 512,
                purpose = UploadedFilePurpose.POST_FILE,
            )
        }.isSameAs(failure)

        verify(postImageStoragePort).deletePostFile("posts/2026/03/orphan.pdf")
    }

    @Test
    fun `registerTempUploadWithCompensation은 보상 삭제 실패가 나도 등록 실패 원인을 유지한다`() {
        val failure = IllegalStateException("temp row save failed")
        doThrow(IllegalStateException("delete failed"))
            .`when`(postImageStoragePort)
            .deletePostImage("posts/2026/03/delete-fail.png")
        val service = newService(AlwaysFailingRepository(failure))

        assertThatThrownBy {
            service.registerTempUploadWithCompensation(
                objectKey = "posts/2026/03/delete-fail.png",
                contentType = "image/png",
                fileSize = 256,
                purpose = UploadedFilePurpose.PROFILE_IMAGE,
            )
        }.isSameAs(failure)

        verify(postImageStoragePort).deletePostImage("posts/2026/03/delete-fail.png")
    }

    @Test
    fun `cleanup diagnostics는 object storage listing 실패 시 degraded reconcile만 반환한다`() {
        val repository = SuccessfulRepository()
        repository.save(
            UploadedFile(
                id = 1,
                objectKey = "posts/2026/03/stale-pending-delete.png",
                bucket = "test-bucket",
                contentType = "image/png",
                fileSize = 128,
                status = UploadedFileStatus.PENDING_DELETE,
                purgeAfter = Instant.parse("2026-05-19T00:00:00Z"),
            ),
        )
        `when`(postImageStoragePort.listObjects("posts/", 1000))
            .thenThrow(IllegalStateException("storage unavailable"))
        val service = newService(repository)

        val diagnostics = service.diagnoseCleanup()

        assertThat(diagnostics.tempCount).isEqualTo(0)
        assertThat(diagnostics.eligibleForPurgeCount).isEqualTo(1)
        assertThat(diagnostics.reconcile.objectPrefix).isEqualTo("posts/")
        assertThat(diagnostics.reconcile.inventoryAvailable).isFalse()
        assertThat(diagnostics.reconcile.repairMode).isEqualTo("dry-run-degraded")
        assertThat(diagnostics.reconcile.bucketOnlyObjectCount).isEqualTo(0)
        assertThat(diagnostics.reconcile.dbOnlyMissingObjectCount).isEqualTo(0)
        assertThat(diagnostics.reconcile.longLivedPendingDeleteCount).isEqualTo(1)
        assertThat(diagnostics.reconcile.sampleLongLivedPendingDeleteObjectKeys)
            .containsExactly("posts/2026/03/stale-pending-delete.png")
    }

    @Test
    fun `cleanup diagnostics는 reconcile prefix 기본값을 storage keyPrefix에서 파생한다`() {
        `when`(postImageStoragePort.listObjects("custom-posts/", 1000))
            .thenReturn(PostImageStoragePort.StoredObjectListing(emptyList(), isTruncated = false))
        val service =
            newService(
                repository = SuccessfulRepository(),
                storageProperties = PostImageStorageProperties(keyPrefix = "custom-posts"),
            )

        val diagnostics = service.diagnoseCleanup()

        assertThat(diagnostics.reconcile.objectPrefix).isEqualTo("custom-posts/")
        verify(postImageStoragePort).listObjects("custom-posts/", 1000)
    }

    @Test
    fun `cleanup diagnostics는 빈 storage keyPrefix를 bucket root prefix로 보존한다`() {
        `when`(postImageStoragePort.listObjects("", 1000))
            .thenReturn(PostImageStoragePort.StoredObjectListing(emptyList(), isTruncated = false))
        val service =
            newService(
                repository = SuccessfulRepository(),
                storageProperties = PostImageStorageProperties(keyPrefix = ""),
            )

        val diagnostics = service.diagnoseCleanup()

        assertThat(diagnostics.reconcile.objectPrefix).isEqualTo("")
        verify(postImageStoragePort).listObjects("", 1000)
    }

    @Test
    fun `cleanup diagnostics는 DB reconcile row truncation을 표시한다`() {
        val repository = SuccessfulRepository()
        repeat(1001) { index ->
            repository.save(
                UploadedFile(
                    id = index.toLong() + 1,
                    objectKey = "posts/2026/03/db-row-$index.png",
                    bucket = "test-bucket",
                    contentType = "image/png",
                    fileSize = 128,
                    status = UploadedFileStatus.ACTIVE,
                ),
            )
        }
        `when`(postImageStoragePort.listObjects("posts/", 1000))
            .thenReturn(PostImageStoragePort.StoredObjectListing(emptyList(), isTruncated = false))
        val service = newService(repository)

        val diagnostics = service.diagnoseCleanup()

        assertThat(diagnostics.reconcile.dbRowsTruncated).isTrue()
        assertThat(diagnostics.reconcile.dbOnlyMissingObjectCount).isEqualTo(1000)
    }

    @Test
    fun `cleanup diagnostics는 DELETED row가 있는 bucket object를 bucket only drift로 표시한다`() {
        val repository = SuccessfulRepository()
        repository.save(
            UploadedFile(
                id = 1,
                objectKey = "posts/2026/03/deleted-but-present.png",
                bucket = "test-bucket",
                contentType = "image/png",
                fileSize = 128,
                status = UploadedFileStatus.DELETED,
            ),
        )
        `when`(postImageStoragePort.listObjects("posts/", 1000))
            .thenReturn(
                PostImageStoragePort.StoredObjectListing(
                    objects =
                        listOf(
                            PostImageStoragePort.StoredObjectSummary(
                                objectKey = "posts/2026/03/deleted-but-present.png",
                                size = 128,
                            ),
                        ),
                    isTruncated = false,
                ),
            )
        val service = newService(repository)

        val diagnostics = service.diagnoseCleanup()

        assertThat(diagnostics.reconcile.bucketOnlyObjectCount).isEqualTo(1)
        assertThat(diagnostics.reconcile.sampleBucketOnlyObjectKeys)
            .containsExactly("posts/2026/03/deleted-but-present.png")
    }

    private fun newService(
        repository: UploadedFileRepositoryPort,
        storageProperties: PostImageStorageProperties = PostImageStorageProperties(),
        retentionProperties: UploadedFileRetentionProperties = UploadedFileRetentionProperties(),
    ): UploadedFileRetentionService =
        UploadedFileRetentionService(
            registrationService =
                UploadedFileRegistrationService(
                    uploadedFileRepository = repository,
                    postImageStoragePort = postImageStoragePort,
                    storageProperties = storageProperties,
                    retentionProperties = retentionProperties,
                    transactionManager = transactionManager,
                    clock = clock,
                    prodSequenceGuardService = prodSequenceGuardService,
                ),
            postAttachmentRetentionService =
                PostAttachmentRetentionService(
                    uploadedFileRepository = repository,
                    storageProperties = storageProperties,
                    retentionProperties = retentionProperties,
                    clock = clock,
                ),
            profileImageRetentionService =
                ProfileImageRetentionService(
                    uploadedFileRepository = repository,
                    postImageStoragePort = postImageStoragePort,
                    storageProperties = storageProperties,
                    retentionProperties = retentionProperties,
                    transactionManager = transactionManager,
                    clock = clock,
                ),
            purgeService =
                UploadedFilePurgeService(
                    uploadedFileRepository = repository,
                    postImageStoragePort = postImageStoragePort,
                    storageProperties = storageProperties,
                    retentionProperties = retentionProperties,
                    referenceQueryService =
                        UploadedFileReferenceQueryService(
                            postRepository = postRepository,
                            memberAttrRepository = memberAttrRepository,
                        ),
                    transactionManager = transactionManager,
                    clock = clock,
                ),
        )

    private class SuccessfulRepository : UploadedFileRepositoryPort {
        private val store = linkedMapOf<String, UploadedFile>()

        override fun save(entity: UploadedFile): UploadedFile {
            store[entity.objectKey] = entity
            return entity
        }

        override fun flush() {}

        override fun findByObjectKey(objectKey: String): UploadedFile? = store[objectKey]

        override fun findByObjectKeyIn(objectKeys: Collection<String>): List<UploadedFile> = objectKeys.mapNotNull(store::get)

        override fun countByStatus(status: UploadedFileStatus): Long = store.values.count { it.status == status }.toLong()

        override fun findByPurposeAndOwnerTypeAndOwnerIdAndStatusNotOrderByCreatedAtDescIdDesc(
            purpose: com.back.global.storage.domain.UploadedFilePurpose,
            ownerType: com.back.global.storage.domain.UploadedFileOwnerType,
            ownerId: Long,
            status: UploadedFileStatus,
        ): List<UploadedFile> = emptyList()

        override fun findByIdAndPurposeAndOwnerTypeAndOwnerId(
            id: Long,
            purpose: com.back.global.storage.domain.UploadedFilePurpose,
            ownerType: com.back.global.storage.domain.UploadedFileOwnerType,
            ownerId: Long,
        ): UploadedFile? = null

        override fun countByStatusInAndPurgeAfterLessThanEqual(
            statuses: Collection<UploadedFileStatus>,
            purgeAfter: Instant,
        ): Long =
            store.values
                .count { uploadedFile ->
                    uploadedFile.status in statuses &&
                        uploadedFile.purgeAfter?.let { !it.isAfter(purgeAfter) } == true
                }.toLong()

        override fun findByStatusInAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
            statuses: Collection<UploadedFileStatus>,
            purgeAfter: Instant,
            pageable: org.springframework.data.domain.Pageable,
        ): List<UploadedFile> =
            store.values
                .filter { uploadedFile ->
                    uploadedFile.status in statuses &&
                        uploadedFile.purgeAfter?.let { !it.isAfter(purgeAfter) } == true
                }.sortedWith(compareBy<UploadedFile> { it.purgeAfter }.thenBy { it.id })
                .drop(pageable.offset.toInt())
                .take(pageable.pageSize)

        override fun findByStatusInAndObjectKeyStartingWithOrderByIdAsc(
            statuses: Collection<UploadedFileStatus>,
            objectKeyPrefix: String,
            pageable: org.springframework.data.domain.Pageable,
        ): List<UploadedFile> =
            store.values
                .filter { it.status in statuses && it.objectKey.startsWith(objectKeyPrefix) }
                .sortedBy { it.id }
                .drop(pageable.offset.toInt())
                .take(pageable.pageSize)
    }

    private class AlwaysFailingRepository(
        private val failure: RuntimeException,
    ) : UploadedFileRepositoryPort {
        override fun save(entity: UploadedFile): UploadedFile = throw failure

        override fun flush() {}

        override fun findByObjectKey(objectKey: String): UploadedFile? = null

        override fun findByObjectKeyIn(objectKeys: Collection<String>): List<UploadedFile> = emptyList()

        override fun countByStatus(status: UploadedFileStatus): Long = 0

        override fun findByPurposeAndOwnerTypeAndOwnerIdAndStatusNotOrderByCreatedAtDescIdDesc(
            purpose: com.back.global.storage.domain.UploadedFilePurpose,
            ownerType: com.back.global.storage.domain.UploadedFileOwnerType,
            ownerId: Long,
            status: UploadedFileStatus,
        ): List<UploadedFile> = emptyList()

        override fun findByIdAndPurposeAndOwnerTypeAndOwnerId(
            id: Long,
            purpose: com.back.global.storage.domain.UploadedFilePurpose,
            ownerType: com.back.global.storage.domain.UploadedFileOwnerType,
            ownerId: Long,
        ): UploadedFile? = null

        override fun countByStatusInAndPurgeAfterLessThanEqual(
            statuses: Collection<UploadedFileStatus>,
            purgeAfter: Instant,
        ): Long = 0

        override fun findByStatusInAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
            statuses: Collection<UploadedFileStatus>,
            purgeAfter: Instant,
            pageable: org.springframework.data.domain.Pageable,
        ): List<UploadedFile> = emptyList()

        override fun findByStatusInAndObjectKeyStartingWithOrderByIdAsc(
            statuses: Collection<UploadedFileStatus>,
            objectKeyPrefix: String,
            pageable: org.springframework.data.domain.Pageable,
        ): List<UploadedFile> = emptyList()
    }

    private class SequenceDriftRecoveringRepository(
        private val firstConflict: DataIntegrityViolationException,
    ) : UploadedFileRepositoryPort {
        private val store = linkedMapOf<String, UploadedFile>()
        var saveCallCount: Int = 0
            private set
        var flushCallCount: Int = 0
            private set

        override fun save(entity: UploadedFile): UploadedFile {
            saveCallCount += 1
            if (saveCallCount == 1) {
                throw firstConflict
            }
            store[entity.objectKey] = entity
            return entity
        }

        override fun flush() {
            flushCallCount += 1
        }

        override fun findByObjectKey(objectKey: String): UploadedFile? = store[objectKey]

        override fun findByObjectKeyIn(objectKeys: Collection<String>): List<UploadedFile> = objectKeys.mapNotNull(store::get)

        override fun countByStatus(status: UploadedFileStatus): Long = 0

        override fun findByPurposeAndOwnerTypeAndOwnerIdAndStatusNotOrderByCreatedAtDescIdDesc(
            purpose: com.back.global.storage.domain.UploadedFilePurpose,
            ownerType: com.back.global.storage.domain.UploadedFileOwnerType,
            ownerId: Long,
            status: UploadedFileStatus,
        ): List<UploadedFile> = emptyList()

        override fun findByIdAndPurposeAndOwnerTypeAndOwnerId(
            id: Long,
            purpose: com.back.global.storage.domain.UploadedFilePurpose,
            ownerType: com.back.global.storage.domain.UploadedFileOwnerType,
            ownerId: Long,
        ): UploadedFile? = null

        override fun countByStatusInAndPurgeAfterLessThanEqual(
            statuses: Collection<UploadedFileStatus>,
            purgeAfter: Instant,
        ): Long = 0

        override fun findByStatusInAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
            statuses: Collection<UploadedFileStatus>,
            purgeAfter: Instant,
            pageable: org.springframework.data.domain.Pageable,
        ): List<UploadedFile> = emptyList()

        override fun findByStatusInAndObjectKeyStartingWithOrderByIdAsc(
            statuses: Collection<UploadedFileStatus>,
            objectKeyPrefix: String,
            pageable: org.springframework.data.domain.Pageable,
        ): List<UploadedFile> = emptyList()
    }

    private class ExistingObjectKeyRecoveringRepository : UploadedFileRepositoryPort {
        private var conflictReturned = false
        private val existing =
            UploadedFile(
                id = 101,
                objectKey = "posts/2026/03/existing.png",
                bucket = "post-img",
                contentType = "application/octet-stream",
                fileSize = 0,
            )
        private val store = linkedMapOf(existing.objectKey to existing)
        var saveCallCount: Int = 0
            private set
        var flushCallCount: Int = 0
            private set

        override fun save(entity: UploadedFile): UploadedFile {
            saveCallCount += 1
            if (!conflictReturned) {
                conflictReturned = true
                throw DataIntegrityViolationException("duplicate key value violates unique constraint \"uk_uploaded_file_object_key\"")
            }

            store[entity.objectKey] = entity
            return entity
        }

        override fun flush() {
            flushCallCount += 1
        }

        override fun findByObjectKey(objectKey: String): UploadedFile? = store[objectKey]

        override fun findByObjectKeyIn(objectKeys: Collection<String>): List<UploadedFile> = objectKeys.mapNotNull(store::get)

        override fun countByStatus(status: UploadedFileStatus): Long = 0

        override fun findByPurposeAndOwnerTypeAndOwnerIdAndStatusNotOrderByCreatedAtDescIdDesc(
            purpose: com.back.global.storage.domain.UploadedFilePurpose,
            ownerType: com.back.global.storage.domain.UploadedFileOwnerType,
            ownerId: Long,
            status: UploadedFileStatus,
        ): List<UploadedFile> = emptyList()

        override fun findByIdAndPurposeAndOwnerTypeAndOwnerId(
            id: Long,
            purpose: com.back.global.storage.domain.UploadedFilePurpose,
            ownerType: com.back.global.storage.domain.UploadedFileOwnerType,
            ownerId: Long,
        ): UploadedFile? = null

        override fun countByStatusInAndPurgeAfterLessThanEqual(
            statuses: Collection<UploadedFileStatus>,
            purgeAfter: Instant,
        ): Long = 0

        override fun findByStatusInAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
            statuses: Collection<UploadedFileStatus>,
            purgeAfter: Instant,
            pageable: org.springframework.data.domain.Pageable,
        ): List<UploadedFile> = emptyList()

        override fun findByStatusInAndObjectKeyStartingWithOrderByIdAsc(
            statuses: Collection<UploadedFileStatus>,
            objectKeyPrefix: String,
            pageable: org.springframework.data.domain.Pageable,
        ): List<UploadedFile> = emptyList()
    }

    private class NoopTransactionManager : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()

        override fun commit(status: TransactionStatus) {}

        override fun rollback(status: TransactionStatus) {}
    }
}
