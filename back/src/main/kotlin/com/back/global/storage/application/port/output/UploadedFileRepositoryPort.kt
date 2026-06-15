package com.back.global.storage.application.port.output

import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileStatus
import org.springframework.data.domain.Pageable
import java.time.Instant

interface UploadedFileRepositoryPort {
    fun save(entity: UploadedFile): UploadedFile

    fun flush()

    fun findByObjectKey(objectKey: String): UploadedFile?

    fun findProfileImagesByOwner(memberId: Long): List<UploadedFile>

    fun findProfileImageByIdAndOwner(
        fileId: Long,
        memberId: Long,
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
}
