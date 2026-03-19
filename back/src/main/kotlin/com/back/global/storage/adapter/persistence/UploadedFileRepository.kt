package com.back.global.storage.adapter.persistence

import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileStatus
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant

/**
 * UploadedFileRepository는 글로벌 모듈 영속 계층 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 저장소 조회/저장 로직을 도메인 요구사항에 맞게 캡슐화합니다.
 */
interface UploadedFileRepository :
    JpaRepository<UploadedFile, Int>,
    UploadedFileRepositoryPort {
    override fun findByObjectKey(objectKey: String): UploadedFile?

    override fun countByStatus(status: UploadedFileStatus): Long

    override fun countByStatusInAndPurgeAfterLessThanEqual(
        statuses: Collection<UploadedFileStatus>,
        purgeAfter: Instant,
    ): Long

    fun findByStatusAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
        status: UploadedFileStatus,
        purgeAfter: Instant,
        pageable: Pageable,
    ): List<UploadedFile>

    override fun findByStatusInAndPurgeAfterLessThanEqualOrderByPurgeAfterAsc(
        statuses: Collection<UploadedFileStatus>,
        purgeAfter: Instant,
        pageable: Pageable,
    ): List<UploadedFile>
}
