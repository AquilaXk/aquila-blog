package com.back.boundedContexts.cloud.adapter.persistence

import com.back.boundedContexts.cloud.application.port.output.CloudExternalPlaybackTokenRepositoryPort
import com.back.boundedContexts.cloud.model.CloudExternalPlaybackToken
import com.back.boundedContexts.cloud.model.CloudExternalPlaybackTokenPurpose
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.time.Instant

interface CloudExternalPlaybackTokenRepository :
    JpaRepository<CloudExternalPlaybackToken, Long>,
    CloudExternalPlaybackTokenRepositoryPort {
    @Query(
        """
        SELECT t
        FROM CloudExternalPlaybackToken t
        WHERE t.tokenHash = :tokenHash
          AND t.fileId = :fileId
          AND t.purpose = :purpose
          AND t.expiresAt > :now
        """,
    )
    override fun findValid(
        tokenHash: String,
        fileId: Long,
        purpose: CloudExternalPlaybackTokenPurpose,
        now: Instant,
    ): CloudExternalPlaybackToken?

    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Query(
        value = """
        delete from cloud_external_playback_token
        where id in (
            select id
            from cloud_external_playback_token
            where expires_at < :cutoff
            order by expires_at asc, id asc
            limit :limit
        )
        """,
        nativeQuery = true,
    )
    override fun deleteByExpiresAtBefore(
        @Param("cutoff") cutoff: Instant,
        @Param("limit") limit: Int,
    ): Int
}
