package com.back.boundedContexts.cloud.application.port.output

import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind

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
}
