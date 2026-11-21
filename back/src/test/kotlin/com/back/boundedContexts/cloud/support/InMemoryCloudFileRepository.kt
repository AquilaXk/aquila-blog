package com.back.boundedContexts.cloud.support

import com.back.boundedContexts.cloud.adapter.web.ApiV1AdmCloudController
import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import java.time.Instant

/** Shared in-memory CloudFileRepositoryPort for unit tests. */
class InMemoryCloudFileRepository : CloudFileRepositoryPort {
    val savedFiles = mutableListOf<CloudFile>()
    var onSave: ((CloudFile) -> Unit)? = null
    var assignAuditTimestamps: Boolean = false
    var failSave: Boolean = false
    private var nextId = 1L

    override fun save(file: CloudFile): CloudFile {
        if (failSave) {
            throw IllegalStateException("save failed")
        }
        val stored =
            if (file.id == 0L) {
                CloudFile
                    .create(
                        id = nextId++,
                        ownerMemberId = file.ownerMemberId,
                        objectKey = file.objectKey,
                        originalFilename = file.originalFilename,
                        contentType = file.contentType,
                        byteSize = file.byteSize,
                        mediaKind = file.mediaKind,
                        folderPath = file.folderPath,
                        checksumSha256 = file.checksumSha256,
                    ).also { copied ->
                        copied.deletedAt = file.deletedAt
                        runCatching { file.createdAt }.onSuccess { copied.createdAt = it }
                        runCatching { file.modifiedAt }.onSuccess { copied.modifiedAt = it }
                    }
            } else {
                file
            }
        if (assignAuditTimestamps) {
            stored.createdAt = Instant.parse("2026-06-12T00:00:00Z")
            stored.modifiedAt = Instant.parse("2026-06-12T00:00:00Z")
        }
        onSave?.invoke(stored)
        savedFiles.removeIf { it.id == stored.id || it.objectKey == stored.objectKey }
        savedFiles += stored
        return stored
    }

    override fun findActiveByOwner(
        ownerMemberId: Long,
        folderPath: String?,
        keyword: String?,
        mediaKind: CloudFileMediaKind?,
    ): List<CloudFile> =
        savedFiles.filter {
            it.ownerMemberId == ownerMemberId &&
                it.deletedAt == null &&
                (folderPath == null || it.folderPath == folderPath) &&
                (keyword.isNullOrBlank() || it.originalFilename.contains(keyword, ignoreCase = true)) &&
                (mediaKind == null || it.mediaKind == mediaKind)
        }

    override fun findActiveByIdAndOwner(
        id: Long,
        ownerMemberId: Long,
    ): CloudFile? =
        savedFiles.firstOrNull {
            it.id == id &&
                it.ownerMemberId == ownerMemberId &&
                it.deletedAt == null
        }

    override fun findActiveByIdsAndOwner(
        ids: Collection<Long>,
        ownerMemberId: Long,
    ): List<CloudFile> =
        savedFiles.filter {
            it.id in ids &&
                it.ownerMemberId == ownerMemberId &&
                it.deletedAt == null
        }

    override fun bulkSoftDelete(
        ids: Collection<Long>,
        ownerMemberId: Long,
        deletedAt: Instant,
    ): Int {
        val targets =
            savedFiles.filter {
                it.id in ids &&
                    it.ownerMemberId == ownerMemberId &&
                    it.deletedAt == null
            }
        targets.forEach {
            it.deletedAt = deletedAt
            it.modifiedAt = deletedAt
        }
        return targets.size
    }

    override fun getFacets(ownerMemberId: Long): ApiV1AdmCloudController.CloudFileFacetsResBody {
        val active = savedFiles.filter { it.ownerMemberId == ownerMemberId && it.deletedAt == null }
        val photos = active.filter { it.mediaKind == CloudFileMediaKind.PHOTO }
        val videos = active.filter { it.mediaKind == CloudFileMediaKind.VIDEO }
        val docs = active.filter { it.mediaKind == CloudFileMediaKind.DOCUMENT }
        return ApiV1AdmCloudController.CloudFileFacetsResBody(
            allCount = active.size.toLong(),
            allBytes = active.sumOf { it.byteSize },
            photoCount = photos.size.toLong(),
            photoBytes = photos.sumOf { it.byteSize },
            videoCount = videos.size.toLong(),
            videoBytes = videos.sumOf { it.byteSize },
            documentCount = docs.size.toLong(),
            documentBytes = docs.sumOf { it.byteSize },
        )
    }

    override fun findActiveByObjectKey(objectKey: String): CloudFile? =
        savedFiles.firstOrNull { it.objectKey == objectKey && it.deletedAt == null }

    override fun findByObjectKey(objectKey: String): CloudFile? = savedFiles.firstOrNull { it.objectKey == objectKey }

    override fun findActiveByObjectKeyStartingWith(
        objectKeyPrefix: String,
        limit: Int,
    ): List<CloudFile> =
        savedFiles
            .filter { it.deletedAt == null && it.objectKey.startsWith(objectKeyPrefix) }
            .sortedBy { it.id }
            .take(limit.coerceAtLeast(1))
}
