package com.back.boundedContexts.cloud.application.port.output

import com.back.boundedContexts.cloud.model.CloudVideoUploadPart
import com.back.boundedContexts.cloud.model.CloudVideoUploadSession

interface CloudVideoUploadSessionRepositoryPort {
    fun save(session: CloudVideoUploadSession): CloudVideoUploadSession

    fun findByIdAndOwner(
        id: Long,
        ownerMemberId: Long,
    ): CloudVideoUploadSession?
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
