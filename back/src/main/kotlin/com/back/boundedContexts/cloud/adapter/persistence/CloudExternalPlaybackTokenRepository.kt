package com.back.boundedContexts.cloud.adapter.persistence

import com.back.boundedContexts.cloud.application.port.output.CloudExternalPlaybackTokenRepositoryPort
import com.back.boundedContexts.cloud.model.CloudExternalPlaybackToken
import com.back.boundedContexts.cloud.model.CloudExternalPlaybackTokenPurpose
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.time.Instant

/**
 * 참조 구현: strapi/strapi (MIT) — media token repository
 */
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

    @Query(
        """
        SELECT t
        FROM CloudExternalPlaybackToken t
        WHERE t.fileId = :fileId
          AND t.purpose = :purpose
          AND t.expiresAt > :now
        ORDER BY t.createdAt DESC, t.id DESC
        """,
    )
    override fun findActiveByFileId(
        @Param("fileId") fileId: Long,
        @Param("purpose") purpose: CloudExternalPlaybackTokenPurpose,
        @Param("now") now: Instant,
    ): List<CloudExternalPlaybackToken>

    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Query(
        """
        DELETE FROM CloudExternalPlaybackToken t
        WHERE t.id = :id
          AND t.fileId = :fileId
          AND t.memberId = :memberId
          AND t.purpose = :purpose
        """,
    )
    override fun deleteByIdAndFileIdAndMemberId(
        @Param("id") id: Long,
        @Param("fileId") fileId: Long,
        @Param("memberId") memberId: Long,
        @Param("purpose") purpose: CloudExternalPlaybackTokenPurpose,
    ): Int

    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Query(
        """
        DELETE FROM CloudExternalPlaybackToken t
        WHERE t.fileId = :fileId
          AND t.memberId = :memberId
          AND t.purpose = :purpose
        """,
    )
    override fun deleteByFileIdAndMemberId(
        @Param("fileId") fileId: Long,
        @Param("memberId") memberId: Long,
        @Param("purpose") purpose: CloudExternalPlaybackTokenPurpose,
    ): Int

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
