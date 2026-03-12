package com.back.global.storage.out

import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileStatus
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant

interface UploadedFileRepository : JpaRepository<UploadedFile, Int> {
    fun findByObjectKey(objectKey: String): UploadedFile?

    fun findByStatusAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
        status: UploadedFileStatus,
        purgeAfter: Instant,
        pageable: Pageable,
    ): List<UploadedFile>
}
