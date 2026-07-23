package com.back.global.storage.application.port.output

import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileOwnerType
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileStatus
import org.springframework.data.domain.Pageable
import java.time.Instant

interface UploadedFileRepositoryPort {
    fun save(entity: UploadedFile): UploadedFile

    fun flush()

    fun findByObjectKey(objectKey: String): UploadedFile?

    fun findByObjectKeyIn(objectKeys: Collection<String>): List<UploadedFile>

    fun findByPurposeAndOwnerTypeAndOwnerIdAndStatusNotOrderByCreatedAtDescIdDesc(
        purpose: UploadedFilePurpose,
        ownerType: UploadedFileOwnerType,
        ownerId: Long,
        status: UploadedFileStatus,
    ): List<UploadedFile>

    fun findByIdAndPurposeAndOwnerTypeAndOwnerId(
        id: Long,
        purpose: UploadedFilePurpose,
        ownerType: UploadedFileOwnerType,
        ownerId: Long,
    ): UploadedFile?

    fun countByStatus(status: UploadedFileStatus): Long

    fun countByStatusInAndPurgeAfterLessThanEqual(
        statuses: Collection<UploadedFileStatus>,
        purgeAfter: Instant,
    ): Long

    fun findByStatusInAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
        statuses: Collection<UploadedFileStatus>,
        purgeAfter: Instant,
        pageable: Pageable,
    ): List<UploadedFile>

    fun findByStatusInAndObjectKeyStartingWithOrderByIdAsc(
        statuses: Collection<UploadedFileStatus>,
        objectKeyPrefix: String,
        pageable: Pageable,
    ): List<UploadedFile>
}
