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
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import java.time.Instant

class UploadedFileRetentionServiceConflictRecoveryTest {
    private val postRepository = mock(PostRepositoryPort::class.java)
    private val memberAttrRepository = mock(MemberAttrRepositoryPort::class.java)
    private val postImageStoragePort = mock(PostImageStoragePort::class.java)
    private val prodSequenceGuardService = mock(ProdSequenceGuardService::class.java)
    private val transactionManager = NoopTransactionManager()

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

    private fun newService(repository: UploadedFileRepositoryPort): UploadedFileRetentionService =
        UploadedFileRetentionService(
            uploadedFileRepository = repository,
            postRepository = postRepository,
            memberAttrRepository = memberAttrRepository,
            postImageStoragePort = postImageStoragePort,
            storageProperties = PostImageStorageProperties(),
            retentionProperties = UploadedFileRetentionProperties(),
            transactionManager = transactionManager,
            prodSequenceGuardService = prodSequenceGuardService,
        )

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

        override fun countByStatus(status: UploadedFileStatus): Long = 0

        override fun countByStatusInAndPurgeAfterLessThanEqual(
            statuses: Collection<UploadedFileStatus>,
            purgeAfter: Instant,
        ): Long = 0

        override fun findByStatusInAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
            statuses: Collection<UploadedFileStatus>,
            purgeAfter: Instant,
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

        override fun countByStatus(status: UploadedFileStatus): Long = 0

        override fun countByStatusInAndPurgeAfterLessThanEqual(
            statuses: Collection<UploadedFileStatus>,
            purgeAfter: Instant,
        ): Long = 0

        override fun findByStatusInAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
            statuses: Collection<UploadedFileStatus>,
            purgeAfter: Instant,
            pageable: org.springframework.data.domain.Pageable,
        ): List<UploadedFile> = emptyList()
    }

    private class NoopTransactionManager : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()

        override fun commit(status: TransactionStatus) {}

        override fun rollback(status: TransactionStatus) {}
    }
}
