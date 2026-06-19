package com.back.boundedContexts.cloud.adapter.persistence

import com.back.boundedContexts.cloud.application.port.output.CloudVideoUploadPartRepositoryPort
import com.back.boundedContexts.cloud.application.port.output.CloudVideoUploadSessionRepositoryPort
import com.back.boundedContexts.cloud.model.CloudVideoUploadPart
import com.back.boundedContexts.cloud.model.CloudVideoUploadSession
import com.back.boundedContexts.cloud.model.CloudVideoUploadSessionStatus
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

interface CloudVideoUploadSessionRepository :
    JpaRepository<CloudVideoUploadSession, Long>,
    CloudVideoUploadSessionRepositoryPort {
    @Query(
        """
        SELECT s
        FROM CloudVideoUploadSession s
        WHERE s.id = :id
          AND s.ownerMemberId = :ownerMemberId
        """,
    )
    override fun findByIdAndOwner(
        id: Long,
        ownerMemberId: Long,
    ): CloudVideoUploadSession?

    @Query(
        value = """
            SELECT *
            FROM cloud_video_upload_session
            WHERE status = 'IN_PROGRESS'
              AND expires_at <= :now
            ORDER BY expires_at ASC, id ASC
            LIMIT :limit
        """,
        nativeQuery = true,
    )
    override fun findExpiredInProgress(
        now: Instant,
        limit: Int,
    ): List<CloudVideoUploadSession>

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(
        """
        UPDATE CloudVideoUploadSession s
        SET s.uploadId = :uploadId,
            s.status = :nextStatus,
            s.failureReason = NULL,
            s.modifiedAt = :now
        WHERE s.id = :id
          AND s.status = :expectedStatus
        """,
    )
    override fun attachUploadIdAndTransition(
        id: Long,
        expectedStatus: CloudVideoUploadSessionStatus,
        uploadId: String,
        nextStatus: CloudVideoUploadSessionStatus,
        now: Instant,
    ): Int

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(
        """
        UPDATE CloudVideoUploadSession s
        SET s.status = :nextStatus,
            s.failureReason = NULL,
            s.modifiedAt = :now
        WHERE s.id = :id
          AND s.status = :expectedStatus
        """,
    )
    override fun transitionStatus(
        id: Long,
        expectedStatus: CloudVideoUploadSessionStatus,
        nextStatus: CloudVideoUploadSessionStatus,
        now: Instant,
    ): Int

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(
        """
        UPDATE CloudVideoUploadSession s
        SET s.status = 'FAILED',
            s.failureReason = :reason,
            s.modifiedAt = :now
        WHERE s.id = :id
          AND s.status = :expectedStatus
        """,
    )
    override fun markFailed(
        id: Long,
        expectedStatus: CloudVideoUploadSessionStatus,
        reason: String,
        now: Instant,
    ): Int
}

interface CloudVideoUploadPartRepository :
    JpaRepository<CloudVideoUploadPart, Long>,
    CloudVideoUploadPartRepositoryPort {
    override fun findBySessionIdAndPartNumber(
        sessionId: Long,
        partNumber: Int,
    ): CloudVideoUploadPart?

    override fun findBySessionId(sessionId: Long): List<CloudVideoUploadPart>

    @Transactional
    @Modifying
    @Query("DELETE FROM CloudVideoUploadPart p WHERE p.sessionId = :sessionId")
    override fun deleteBySessionId(sessionId: Long)
}
