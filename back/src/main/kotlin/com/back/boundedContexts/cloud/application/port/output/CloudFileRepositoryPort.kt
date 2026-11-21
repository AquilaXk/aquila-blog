package com.back.boundedContexts.cloud.application.port.output

import com.back.boundedContexts.cloud.adapter.web.ApiV1AdmCloudController.CloudFileFacetsResBody
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import java.time.Instant

/**
 * 참조 구현: strapi/strapi (MIT) packages/core/upload & payloadcms/payload (MIT)
 */
interface CloudFileRepositoryPort {
    fun save(file: CloudFile): CloudFile

    fun findActiveByOwner(
        ownerMemberId: Long,
        folderPath: String?,
        keyword: String?,
        mediaKind: CloudFileMediaKind?,
    ): List<CloudFile>

    fun findActiveByIdAndOwner(
        id: Long,
        ownerMemberId: Long,
    ): CloudFile?

    fun findActiveByIdsAndOwner(
        ids: Collection<Long>,
        ownerMemberId: Long,
    ): List<CloudFile>

    fun bulkSoftDelete(
        ids: Collection<Long>,
        ownerMemberId: Long,
        deletedAt: Instant,
    ): Int

    fun getFacets(ownerMemberId: Long): CloudFileFacetsResBody

    fun findActiveByObjectKey(objectKey: String): CloudFile?

    fun findByObjectKey(objectKey: String): CloudFile?

    fun findActiveByObjectKeyStartingWith(
        objectKeyPrefix: String,
        limit: Int,
    ): List<CloudFile>
}
