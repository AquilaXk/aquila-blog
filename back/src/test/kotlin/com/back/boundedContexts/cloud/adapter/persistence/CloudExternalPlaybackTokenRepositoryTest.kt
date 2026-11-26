package com.back.boundedContexts.cloud.adapter.persistence

import com.back.boundedContexts.cloud.model.CloudExternalPlaybackToken
import com.back.boundedContexts.cloud.model.CloudExternalPlaybackTokenPurpose
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.boundedContexts.member.adapter.persistence.MemberRepository
import com.back.boundedContexts.member.domain.shared.Member
import com.back.support.BaseRepositoryIntegrationTest
import jakarta.persistence.EntityManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.security.MessageDigest
import java.sql.Timestamp
import java.time.Instant

@DisplayName("CloudExternalPlaybackTokenRepository 테스트")
class CloudExternalPlaybackTokenRepositoryTest : BaseRepositoryIntegrationTest() {
    @Autowired
    private lateinit var memberRepository: MemberRepository

    @Autowired
    private lateinit var cloudFileRepository: CloudFileRepository

    @Autowired
    private lateinit var tokenRepository: CloudExternalPlaybackTokenRepository

    @Autowired
    private lateinit var entityManager: EntityManager

    @Test
    @DisplayName("findValid와 findActiveByFileId는 purpose, 파일, 만료 경계를 격리해 조회한다")
    fun `findValid와 findActiveByFileId는 purpose 파일 만료 경계를 격리해 조회한다`() {
        val owner = memberRepository.saveAndFlush(Member(0, "token-read-owner", "1234", "토큰 소유자"))
        val file1 = saveVideoFile(owner.id, "cloud/${owner.id}/v1.mp4")
        val file2 = saveVideoFile(owner.id, "cloud/${owner.id}/v2.mp4")
        val now = Instant.parse("2026-06-26T12:00:00Z")

        val playbackOlder =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("playback-older"),
                    fileId = file1.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                    expiresAt = now.plusSeconds(3600),
                ),
            )
        val playbackNewer =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("playback-newer"),
                    fileId = file1.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                    expiresAt = now.plusSeconds(7200),
                ),
            )
        val playbackAtExactBoundary =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("playback-boundary"),
                    fileId = file1.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                    expiresAt = now,
                ),
            )
        tokenRepository.saveAndFlush(
            CloudExternalPlaybackToken.create(
                tokenHash = hashFor("playback-expired"),
                fileId = file1.id,
                memberId = owner.id,
                purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                expiresAt = now.minusSeconds(1),
            ),
        )
        val shareValid =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("share-valid"),
                    fileId = file1.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.SHARE_LINK,
                    expiresAt = now.plusSeconds(3600),
                ),
            )
        val otherFilePlayback =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("other-file-playback"),
                    fileId = file2.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                    expiresAt = now.plusSeconds(3600),
                ),
            )

        updateCreatedAt(playbackOlder.id, Instant.parse("2026-06-26T10:00:00Z"))
        updateCreatedAt(playbackNewer.id, Instant.parse("2026-06-26T11:00:00Z"))
        entityManager.clear()

        val foundValid =
            tokenRepository.findValid(
                tokenHash = playbackOlder.tokenHash,
                fileId = file1.id,
                purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                now = now,
            )
        assertThat(foundValid?.id).isEqualTo(playbackOlder.id)

        assertThat(
            tokenRepository.findValid(
                tokenHash = shareValid.tokenHash,
                fileId = file1.id,
                purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                now = now,
            ),
        ).isNull()

        assertThat(
            tokenRepository.findValid(
                tokenHash = playbackOlder.tokenHash,
                fileId = file1.id,
                purpose = CloudExternalPlaybackTokenPurpose.SHARE_LINK,
                now = now,
            ),
        ).isNull()

        assertThat(
            tokenRepository.findValid(
                tokenHash = playbackAtExactBoundary.tokenHash,
                fileId = file1.id,
                purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                now = now,
            ),
        ).isNull()

        assertThat(
            tokenRepository.findValid(
                tokenHash = otherFilePlayback.tokenHash,
                fileId = file1.id,
                purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                now = now,
            ),
        ).isNull()

        val activePlayback =
            tokenRepository.findActiveByFileId(
                fileId = file1.id,
                purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                now = now,
            )
        assertThat(activePlayback).extracting<Long> { it.id }.containsExactly(playbackNewer.id, playbackOlder.id)

        val activeShare =
            tokenRepository.findActiveByFileId(
                fileId = file1.id,
                purpose = CloudExternalPlaybackTokenPurpose.SHARE_LINK,
                now = now,
            )
        assertThat(activeShare).extracting<Long> { it.id }.containsExactly(shareValid.id)
    }

    @Test
    @DisplayName("deleteByIdAndFileIdAndMemberId와 deleteByFileIdAndMemberId는 purpose·소유주·파일별로 격리 삭제한다")
    fun `deleteByIdAndFileIdAndMemberId와 deleteByFileIdAndMemberId는 purpose 소유주 파일별로 격리 삭제한다`() {
        val owner = memberRepository.saveAndFlush(Member(0, "token-del-owner", "1234", "토큰 삭제 소유자"))
        val otherMember = memberRepository.saveAndFlush(Member(0, "token-del-other", "1234", "다른 사용자"))
        val file1 = saveVideoFile(owner.id, "cloud/${owner.id}/del1.mp4")
        val file2 = saveVideoFile(owner.id, "cloud/${owner.id}/del2.mp4")
        val expiresAt = Instant.parse("2026-06-27T00:00:00Z")

        val playback1 =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("del-playback-1"),
                    fileId = file1.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                    expiresAt = expiresAt,
                ),
            )
        val playback2 =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("del-playback-2"),
                    fileId = file1.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                    expiresAt = expiresAt,
                ),
            )
        val share1 =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("del-share-1"),
                    fileId = file1.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.SHARE_LINK,
                    expiresAt = expiresAt,
                ),
            )
        val share2 =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("del-share-2"),
                    fileId = file1.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.SHARE_LINK,
                    expiresAt = expiresAt,
                ),
            )
        val otherFileShare =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("del-other-file-share"),
                    fileId = file2.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.SHARE_LINK,
                    expiresAt = expiresAt,
                ),
            )

        assertThat(
            tokenRepository.deleteByIdAndFileIdAndMemberId(
                id = share1.id,
                fileId = file1.id,
                memberId = owner.id,
                purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
            ),
        ).isZero()
        assertThat(
            tokenRepository.deleteByIdAndFileIdAndMemberId(
                id = share1.id,
                fileId = file1.id,
                memberId = otherMember.id,
                purpose = CloudExternalPlaybackTokenPurpose.SHARE_LINK,
            ),
        ).isZero()
        assertThat(
            tokenRepository.deleteByIdAndFileIdAndMemberId(
                id = share1.id,
                fileId = file2.id,
                memberId = owner.id,
                purpose = CloudExternalPlaybackTokenPurpose.SHARE_LINK,
            ),
        ).isZero()
        assertThat(
            tokenRepository.deleteByIdAndFileIdAndMemberId(
                id = share1.id,
                fileId = file1.id,
                memberId = owner.id,
                purpose = CloudExternalPlaybackTokenPurpose.SHARE_LINK,
            ),
        ).isEqualTo(1)
        entityManager.clear()
        assertThat(tokenRepository.findById(share1.id)).isEmpty()
        assertThat(tokenRepository.findById(share2.id)).isPresent()

        assertThat(
            tokenRepository.deleteByFileIdAndMemberId(
                fileId = file1.id,
                memberId = otherMember.id,
                purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
            ),
        ).isZero()
        assertThat(
            tokenRepository.deleteByFileIdAndMemberId(
                fileId = file1.id,
                memberId = owner.id,
                purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
            ),
        ).isEqualTo(2)
        entityManager.clear()

        assertThat(tokenRepository.findById(playback1.id)).isEmpty()
        assertThat(tokenRepository.findById(playback2.id)).isEmpty()
        assertThat(tokenRepository.findById(share2.id)).isPresent()
        assertThat(tokenRepository.findById(otherFileShare.id)).isPresent()
    }

    @Test
    @DisplayName("deleteByExpiresAtBefore는 만료된 행만 오래된 순으로 limit만큼 배치 삭제한다")
    fun `deleteByExpiresAtBefore는 만료된 행만 오래된 순으로 limit만큼 배치 삭제한다`() {
        val owner = memberRepository.saveAndFlush(Member(0, "token-purge-owner", "1234", "토큰 정리 소유자"))
        val file = saveVideoFile(owner.id, "cloud/${owner.id}/purge.mp4")
        val cutoff = Instant.parse("2026-06-26T12:00:00Z")

        val oldestExpired =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("purge-oldest"),
                    fileId = file.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                    expiresAt = cutoff.minusSeconds(120),
                ),
            )
        val newerExpired =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("purge-newer"),
                    fileId = file.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.SHARE_LINK,
                    expiresAt = cutoff.minusSeconds(30),
                ),
            )
        val exactCutoff =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("purge-exact"),
                    fileId = file.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.SHARE_LINK,
                    expiresAt = cutoff,
                ),
            )
        val futureValid =
            tokenRepository.saveAndFlush(
                CloudExternalPlaybackToken.create(
                    tokenHash = hashFor("purge-future"),
                    fileId = file.id,
                    memberId = owner.id,
                    purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                    expiresAt = cutoff.plusSeconds(60),
                ),
            )

        val firstBatchDeleted = tokenRepository.deleteByExpiresAtBefore(cutoff = cutoff, limit = 1)
        entityManager.clear()

        assertThat(firstBatchDeleted).isEqualTo(1)
        assertThat(tokenRepository.findById(oldestExpired.id)).isEmpty()
        assertThat(tokenRepository.findById(newerExpired.id)).isPresent()
        assertThat(tokenRepository.findById(exactCutoff.id)).isPresent()
        assertThat(tokenRepository.findById(futureValid.id)).isPresent()

        val secondBatchDeleted = tokenRepository.deleteByExpiresAtBefore(cutoff = cutoff, limit = 10)
        entityManager.clear()

        assertThat(secondBatchDeleted).isEqualTo(1)
        assertThat(tokenRepository.findById(newerExpired.id)).isEmpty()
        assertThat(tokenRepository.findById(exactCutoff.id)).isPresent()
        assertThat(tokenRepository.findById(futureValid.id)).isPresent()
    }

    private fun saveVideoFile(
        ownerMemberId: Long,
        objectKey: String,
    ): CloudFile =
        cloudFileRepository.saveAndFlush(
            CloudFile.create(
                ownerMemberId = ownerMemberId,
                objectKey = objectKey,
                originalFilename = "demo.mp4",
                contentType = "video/mp4",
                byteSize = 1024L,
                mediaKind = CloudFileMediaKind.VIDEO,
                folderPath = "videos",
                checksumSha256 = "abc123",
            ),
        )

    private fun updateCreatedAt(
        tokenId: Long,
        createdAt: Instant,
    ) {
        entityManager
            .createNativeQuery("UPDATE cloud_external_playback_token SET created_at = :ts WHERE id = :id")
            .setParameter("ts", Timestamp.from(createdAt))
            .setParameter("id", tokenId)
            .executeUpdate()
    }

    private fun hashFor(seed: String): String =
        MessageDigest
            .getInstance("SHA-256")
            .digest(seed.toByteArray())
            .joinToString("") { "%02x".format(it) }
}
