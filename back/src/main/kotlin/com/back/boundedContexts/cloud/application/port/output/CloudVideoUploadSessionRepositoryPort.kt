package com.back.boundedContexts.cloud.application.port.output

import com.back.boundedContexts.cloud.model.CloudVideoUploadPart
import com.back.boundedContexts.cloud.model.CloudVideoUploadSession
import com.back.boundedContexts.cloud.model.CloudVideoUploadSessionStatus
import java.time.Instant

interface CloudVideoUploadSessionRepositoryPort {
    fun save(session: CloudVideoUploadSession): CloudVideoUploadSession

    fun findByIdAndOwner(
        id: Long,
        ownerMemberId: Long,
    ): CloudVideoUploadSession?

    fun findExpiredInProgress(
        now: Instant,
        limit: Int,
    ): List<CloudVideoUploadSession>

    fun attachUploadIdAndTransition(
        id: Long,
        expectedStatus: CloudVideoUploadSessionStatus,
        uploadId: String,
        nextStatus: CloudVideoUploadSessionStatus,
        now: Instant,
    ): Int

    fun transitionStatus(
        id: Long,
        expectedStatus: CloudVideoUploadSessionStatus,
        nextStatus: CloudVideoUploadSessionStatus,
        now: Instant,
    ): Int

    fun markFailed(
        id: Long,
        expectedStatus: CloudVideoUploadSessionStatus,
        reason: String,
        now: Instant,
    ): Int
}

interface CloudVideoUploadPartRepositoryPort {
    fun save(part: CloudVideoUploadPart): CloudVideoUploadPart

    fun findBySessionIdAndPartNumber(
        sessionId: Long,
        partNumber: Int,
    ): CloudVideoUploadPart?

    fun findBySessionId(sessionId: Long): List<CloudVideoUploadPart>

    fun deleteBySessionId(sessionId: Long)
}
