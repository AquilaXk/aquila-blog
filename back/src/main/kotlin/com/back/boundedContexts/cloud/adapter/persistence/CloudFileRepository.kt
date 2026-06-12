package com.back.boundedContexts.cloud.adapter.persistence

import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface CloudFileRepository :
    JpaRepository<CloudFile, Long>,
    CloudFileRepositoryPort {
    @Query(
        """
        SELECT f
        FROM CloudFile f
        WHERE f.ownerMemberId = :ownerMemberId
          AND f.deletedAt IS NULL
          AND (:folderPath IS NULL OR f.folderPath = :folderPath)
          AND (:keyword IS NULL OR LOWER(f.originalFilename) LIKE LOWER(CONCAT('%', :keyword, '%')))
          AND (:mediaKind IS NULL OR f.mediaKind = :mediaKind)
        ORDER BY f.createdAt DESC, f.id DESC
        """,
    )
    override fun findActiveByOwner(
        @Param("ownerMemberId")
        ownerMemberId: Long,
        @Param("folderPath")
        folderPath: String?,
        @Param("keyword")
        keyword: String?,
        @Param("mediaKind")
        mediaKind: CloudFileMediaKind?,
    ): List<CloudFile>

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
        @Param("id")
        id: Long,
        @Param("ownerMemberId")
        ownerMemberId: Long,
    ): CloudFile?
}
