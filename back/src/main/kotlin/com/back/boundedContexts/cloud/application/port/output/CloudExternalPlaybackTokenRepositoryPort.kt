package com.back.boundedContexts.cloud.application.port.output

import com.back.boundedContexts.cloud.model.CloudExternalPlaybackToken
import com.back.boundedContexts.cloud.model.CloudExternalPlaybackTokenPurpose
import java.time.Instant

/**
 * 참조 구현: strapi/strapi (MIT) — media token port
 */
interface CloudExternalPlaybackTokenRepositoryPort {
    fun save(token: CloudExternalPlaybackToken): CloudExternalPlaybackToken

    fun findValid(
        tokenHash: String,
        fileId: Long,
        purpose: CloudExternalPlaybackTokenPurpose,
        now: Instant,
    ): CloudExternalPlaybackToken?

    fun findActiveByFileId(
        fileId: Long,
        now: Instant,
    ): List<CloudExternalPlaybackToken>

    fun deleteByIdAndFileIdAndMemberId(
        id: Long,
        fileId: Long,
        memberId: Long,
    ): Int

    fun deleteByFileIdAndMemberId(
        fileId: Long,
        memberId: Long,
    ): Int

    fun deleteByExpiresAtBefore(
        cutoff: Instant,
        limit: Int,
    ): Int
}
