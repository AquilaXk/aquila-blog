package com.back.boundedContexts.cloud.adapter.persistence

import com.back.boundedContexts.cloud.adapter.web.ApiV1AdmCloudController.CloudFileFacetsResBody
import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.time.Instant

/**
 * 참조 구현: strapi/strapi (MIT) packages/core/upload & payloadcms/payload (MIT)
 */
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

    @Query(
        """
        SELECT f
        FROM CloudFile f
        WHERE f.id IN :ids
          AND f.ownerMemberId = :ownerMemberId
          AND f.deletedAt IS NULL
        """,
    )
    override fun findActiveByIdsAndOwner(
        @Param("ids") ids: Collection<Long>,
        @Param("ownerMemberId") ownerMemberId: Long,
    ): List<CloudFile>

    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Query(
        """
        UPDATE CloudFile f
        SET f.deletedAt = :deletedAt, f.modifiedAt = :deletedAt
        WHERE f.ownerMemberId = :ownerMemberId
          AND f.deletedAt IS NULL
          AND f.id IN :ids
        """,
    )
    override fun bulkSoftDelete(
        @Param("ids") ids: Collection<Long>,
        @Param("ownerMemberId") ownerMemberId: Long,
        @Param("deletedAt") deletedAt: Instant,
    ): Int

    @Query(
        """
        SELECT f
        FROM CloudFile f
        WHERE f.objectKey = :objectKey
          AND f.deletedAt IS NULL
        """,
    )
    override fun findActiveByObjectKey(objectKey: String): CloudFile?

    @Query(
        """
        SELECT f
        FROM CloudFile f
        WHERE f.objectKey = :objectKey
        """,
    )
    override fun findByObjectKey(objectKey: String): CloudFile?

    @Query(
        """
        SELECT f
        FROM CloudFile f
        WHERE f.deletedAt IS NULL
          AND f.objectKey LIKE CONCAT(:objectKeyPrefix, '%')
        ORDER BY f.id ASC
        """,
    )
    fun findActiveByObjectKeyPrefix(
        objectKeyPrefix: String,
        pageable: Pageable,
    ): List<CloudFile>
}

interface CloudFileRepositoryCustom {
    fun findActiveByOwner(
        ownerMemberId: Long,
        folderPath: String?,
        keyword: String?,
        mediaKind: CloudFileMediaKind?,
    ): List<CloudFile>

    fun findActiveByObjectKeyStartingWith(
        objectKeyPrefix: String,
        limit: Int,
    ): List<CloudFile>

    fun getFacets(ownerMemberId: Long): CloudFileFacetsResBody
}
