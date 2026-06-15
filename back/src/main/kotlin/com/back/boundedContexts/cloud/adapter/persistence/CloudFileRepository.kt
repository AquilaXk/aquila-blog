package com.back.boundedContexts.cloud.adapter.persistence

import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface CloudFileRepository :
    JpaRepository<CloudFile, Long>,
    CloudFileRepositoryPort,
    CloudFileRepositoryCustom {
    @Query(
        """
        SELECT f
        FROM CloudFile f
        WHERE f.id = :id
          AND f.ownerMemberId = :ownerMemberId
          AND f.deletedAt IS NULL
        """,
    )
    override fun findActiveByIdAndOwner(
        id: Long,
        ownerMemberId: Long,
    ): CloudFile?
}

interface CloudFileRepositoryCustom {
    fun findActiveByOwner(
        ownerMemberId: Long,
        folderPath: String?,
        keyword: String?,
        mediaKind: CloudFileMediaKind?,
    ): List<CloudFile>
}
