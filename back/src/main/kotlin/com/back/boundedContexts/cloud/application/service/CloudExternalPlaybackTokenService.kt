package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.application.port.output.CloudExternalPlaybackTokenRepositoryPort
import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.model.CloudExternalPlaybackToken
import com.back.boundedContexts.cloud.model.CloudExternalPlaybackTokenPurpose
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.metrics.CloudMediaMetrics
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.HexFormat

data class CloudExternalPlaybackTokenDto(
    val fileId: Long,
    val token: String,
    val expiresAt: Instant,
    val contentPath: String,
)

data class CloudExternalPlaybackTokenSummaryDto(
    val id: Long,
    val fileId: Long,
    val createdAt: Instant,
    val expiresAt: Instant,
    val purpose: CloudExternalPlaybackTokenPurpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
)

data class CloudExternalPlaybackTokenListResBody(
    val tokens: List<CloudExternalPlaybackTokenSummaryDto>,
)

data class RevokeExternalPlaybackTokensResBody(
    val revokedCount: Int,
)

/**
 * 참조 구현: strapi/strapi (MIT) — media token lifecycle & revocation
 *         supabase/supabase (Apache-2.0) CustomExpiryModal — 1h/6h/24h/7d selectable expiry
 */
@Service
class CloudExternalPlaybackTokenService(
    private val cloudFileRepository: CloudFileRepositoryPort,
    private val cloudExternalPlaybackTokenRepository: CloudExternalPlaybackTokenRepositoryPort,
    private val cloudStoragePort: CloudStoragePort,
    private val clock: Clock = Clock.systemUTC(),
    @param:Value("\${custom.storage.cloudExternalPlaybackTokenCleanupGraceSeconds:3600}")
    private val cleanupGraceSeconds: Long = 3600,
    private val meterRegistry: MeterRegistry? = null,
    private val transactionManager: PlatformTransactionManager? = null,
) {
    @Transactional
    fun issue(
        ownerMemberId: Long,
        fileId: Long,
        ttlSeconds: Long? = null,
    ): CloudExternalPlaybackTokenDto {
        val file =
            try {
                findVideoFile(ownerMemberId, fileId)
            } catch (ex: AppException) {
                CloudMediaMetrics.recordTokenOperation(meterRegistry, op = "denied")
                throw ex
            }
        return createTokenRecord(
            file = file,
            purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
            ttl = resolveTtlDuration(ttlSeconds),
        )
    }

    @Transactional
    fun issueShareLink(
        ownerMemberId: Long,
        fileId: Long,
        ttlSeconds: Long? = null,
    ): CloudExternalPlaybackTokenDto {
        val file =
            try {
                findActiveOwnedFile(ownerMemberId, fileId)
            } catch (ex: AppException) {
                CloudMediaMetrics.recordTokenOperation(meterRegistry, op = "denied")
                throw ex
            }
        return createTokenRecord(
            file = file,
            purpose = CloudExternalPlaybackTokenPurpose.SHARE_LINK,
            ttl = resolveTtlDuration(ttlSeconds),
        )
    }

    private fun createTokenRecord(
        file: CloudFile,
        purpose: CloudExternalPlaybackTokenPurpose,
        ttl: Duration,
    ): CloudExternalPlaybackTokenDto {
        val rawToken = generateRawToken()
        val expiresAt = clock.instant().plus(ttl)
        cloudExternalPlaybackTokenRepository.save(
            CloudExternalPlaybackToken.create(
                tokenHash = hashToken(rawToken),
                fileId = file.id,
                memberId = file.ownerMemberId,
                purpose = purpose,
                expiresAt = expiresAt,
            ),
        )
        CloudMediaMetrics.recordTokenOperation(meterRegistry, op = "issued")

        val contentPath =
            when (purpose) {
                CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK -> externalContentPath(file.id, rawToken)
                CloudExternalPlaybackTokenPurpose.SHARE_LINK -> externalSharePath(file.id, rawToken)
            }

        return CloudExternalPlaybackTokenDto(
            fileId = file.id,
            token = rawToken,
            expiresAt = expiresAt,
            contentPath = contentPath,
        )
    }

    @Transactional(readOnly = true)
    fun getFile(
        token: String,
        fileId: Long,
    ): CloudFileDto = resolveTokenFile(token, fileId, CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK).toDto()

    @Transactional(readOnly = true)
    fun getSharedFile(
        token: String,
        fileId: Long,
    ): CloudFileDto = resolveTokenFile(token, fileId, CloudExternalPlaybackTokenPurpose.SHARE_LINK).toDto()

    fun openContent(
        token: String,
        fileId: Long,
    ): CloudFileContent {
        val file =
            executeReadOnlyTransaction {
                resolveTokenFile(token, fileId, CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK).toDto()
            }
        return openStoredContent(file)
    }

    fun openSharedContent(
        token: String,
        fileId: Long,
    ): CloudFileContent {
        val file =
            executeReadOnlyTransaction {
                resolveTokenFile(token, fileId, CloudExternalPlaybackTokenPurpose.SHARE_LINK).toDto()
            }
        return openStoredContent(file)
    }

    private fun openStoredContent(file: CloudFileDto): CloudFileContent {
        val storedObject =
            cloudStoragePort.open(file.objectKey)
                ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")

        return CloudFileContent(
            file = file,
            storedObject = storedObject,
        )
    }

    fun openContentRange(
        file: CloudFileDto,
        range: LongRange,
    ): CloudFileContent {
        val storedObject =
            cloudStoragePort.openRange(file.objectKey, range)
                ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")

        return CloudFileContent(
            file = file,
            storedObject = storedObject,
        )
    }

    fun openContentRange(
        token: String,
        fileId: Long,
        range: LongRange,
    ): CloudFileContent {
        val file =
            executeReadOnlyTransaction {
                resolveTokenFile(token, fileId, CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK).toDto()
            }
        return openContentRange(file, range)
    }

    private fun <T : Any> executeReadOnlyTransaction(action: () -> T): T {
        val manager = transactionManager ?: return action()
        val template =
            TransactionTemplate(manager).apply {
                propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRED
                isReadOnly = true
            }
        lateinit var result: T
        template.executeWithoutResult { result = action() }
        return result
    }

    @Transactional
    fun purgeExpiredTokens(batchSize: Int): Int {
        val safeBatchSize = batchSize.coerceIn(1, 1_000)
        val graceSeconds = cleanupGraceSeconds.coerceAtLeast(0)
        val cutoff = clock.instant().minusSeconds(graceSeconds)
        val deleted = cloudExternalPlaybackTokenRepository.deleteByExpiresAtBefore(cutoff, safeBatchSize)
        CloudMediaMetrics.recordTokenOperation(
            meterRegistry,
            op = "expired-cleaned",
            amount = deleted.toDouble(),
        )
        return deleted
    }

    @Transactional(readOnly = true)
    fun listActiveTokens(
        ownerMemberId: Long,
        fileId: Long,
    ): List<CloudExternalPlaybackTokenSummaryDto> {
        findVideoFile(ownerMemberId, fileId)
        return listActiveTokenSummaries(fileId, CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK)
    }

    @Transactional(readOnly = true)
    fun listShareTokens(
        ownerMemberId: Long,
        fileId: Long,
    ): List<CloudExternalPlaybackTokenSummaryDto> {
        findActiveOwnedFile(ownerMemberId, fileId)
        return listActiveTokenSummaries(fileId, CloudExternalPlaybackTokenPurpose.SHARE_LINK)
    }

    private fun listActiveTokenSummaries(
        fileId: Long,
        purpose: CloudExternalPlaybackTokenPurpose,
    ): List<CloudExternalPlaybackTokenSummaryDto> {
        val activeTokens = cloudExternalPlaybackTokenRepository.findActiveByFileId(fileId, purpose, clock.instant())
        return activeTokens.map {
            CloudExternalPlaybackTokenSummaryDto(
                id = it.id,
                fileId = it.fileId,
                createdAt = runCatching { it.createdAt }.getOrDefault(clock.instant()),
                expiresAt = it.expiresAt,
                purpose = it.purpose,
            )
        }
    }

    @Transactional
    fun revokeToken(
        ownerMemberId: Long,
        fileId: Long,
        tokenId: Long,
    ) {
        findVideoFile(ownerMemberId, fileId)
        deleteSingleToken(ownerMemberId, fileId, tokenId, CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK)
    }

    @Transactional
    fun revokeShareToken(
        ownerMemberId: Long,
        fileId: Long,
        tokenId: Long,
    ) {
        findActiveOwnedFile(ownerMemberId, fileId)
        deleteSingleToken(ownerMemberId, fileId, tokenId, CloudExternalPlaybackTokenPurpose.SHARE_LINK)
    }

    private fun deleteSingleToken(
        ownerMemberId: Long,
        fileId: Long,
        tokenId: Long,
        purpose: CloudExternalPlaybackTokenPurpose,
    ) {
        val deleted =
            cloudExternalPlaybackTokenRepository.deleteByIdAndFileIdAndMemberId(
                id = tokenId,
                fileId = fileId,
                memberId = ownerMemberId,
                purpose = purpose,
            )
        if (deleted == 0) {
            throw AppException(ErrorCode.NOT_FOUND, "공유 또는 재생 링크를 찾을 수 없습니다.")
        }
        CloudMediaMetrics.recordTokenOperation(meterRegistry, op = "revoked")
    }

    @Transactional
    fun revokeAllTokens(
        ownerMemberId: Long,
        fileId: Long,
    ): Int {
        findVideoFile(ownerMemberId, fileId)
        return deleteAllFileTokens(ownerMemberId, fileId, CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK)
    }

    @Transactional
    fun revokeAllShareTokens(
        ownerMemberId: Long,
        fileId: Long,
    ): Int {
        findActiveOwnedFile(ownerMemberId, fileId)
        return deleteAllFileTokens(ownerMemberId, fileId, CloudExternalPlaybackTokenPurpose.SHARE_LINK)
    }

    private fun deleteAllFileTokens(
        ownerMemberId: Long,
        fileId: Long,
        purpose: CloudExternalPlaybackTokenPurpose,
    ): Int {
        val deleted =
            cloudExternalPlaybackTokenRepository.deleteByFileIdAndMemberId(
                fileId = fileId,
                memberId = ownerMemberId,
                purpose = purpose,
            )
        CloudMediaMetrics.recordTokenOperation(meterRegistry, op = "revoked-all", amount = deleted.toDouble())
        return deleted
    }

    private fun findActiveOwnedFile(
        ownerMemberId: Long,
        fileId: Long,
    ): CloudFile =
        cloudFileRepository.findActiveByIdAndOwner(fileId, ownerMemberId)
            ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")

    private fun findVideoFile(
        ownerMemberId: Long,
        fileId: Long,
    ): CloudFile {
        val file = findActiveOwnedFile(ownerMemberId, fileId)
        if (file.mediaKind != CloudFileMediaKind.VIDEO) {
            throw AppException(ErrorCode.BAD_REQUEST, "동영상 파일만 외부 재생할 수 있습니다.")
        }
        return file
    }

    private fun resolveTokenFile(
        token: String,
        fileId: Long,
        purpose: CloudExternalPlaybackTokenPurpose,
    ): CloudFile {
        val normalizedToken = token.trim()
        if (normalizedToken.isBlank()) {
            CloudMediaMetrics.recordTokenOperation(meterRegistry, op = "denied")
            throw AppException(ErrorCode.CLOUD_PLAYBACK_DENIED, "공유 또는 재생 링크가 올바르지 않거나 만료되었습니다.")
        }
        val playbackToken =
            cloudExternalPlaybackTokenRepository.findValid(
                tokenHash = hashToken(normalizedToken),
                fileId = fileId,
                purpose = purpose,
                now = clock.instant(),
            )
        if (playbackToken == null) {
            CloudMediaMetrics.recordTokenOperation(meterRegistry, op = "denied")
            throw AppException(ErrorCode.CLOUD_PLAYBACK_DENIED, "공유 또는 재생 링크가 올바르지 않거나 만료되었습니다.")
        }

        return try {
            when (purpose) {
                CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK -> findVideoFile(playbackToken.memberId, fileId)
                CloudExternalPlaybackTokenPurpose.SHARE_LINK -> findActiveOwnedFile(playbackToken.memberId, fileId)
            }
        } catch (ex: AppException) {
            CloudMediaMetrics.recordTokenOperation(meterRegistry, op = "denied")
            throw ex
        }
    }

    private fun CloudFile.toDto(): CloudFileDto =
        CloudFileDto(
            id = id,
            ownerMemberId = ownerMemberId,
            originalFilename = originalFilename,
            contentType = contentType,
            byteSize = byteSize,
            mediaKind = mediaKind,
            folderPath = folderPath,
            createdAt = runCatching { createdAt }.getOrDefault(clock.instant()),
            modifiedAt = runCatching { modifiedAt }.getOrDefault(clock.instant()),
            objectKey = objectKey,
            checksumSha256 = checksumSha256,
        )

    private fun resolveTtlDuration(ttlSeconds: Long?): Duration {
        if (ttlSeconds == null) return TOKEN_TTL
        if (ttlSeconds !in ALLOWED_SHARE_TTL_SECONDS) {
            throw AppException(ErrorCode.BAD_REQUEST, "지원하지 않는 공유 만료 기한입니다.")
        }
        return Duration.ofSeconds(ttlSeconds)
    }

    companion object {
        private val TOKEN_TTL: Duration = Duration.ofHours(6)
        private val ALLOWED_SHARE_TTL_SECONDS: Set<Long> = setOf(3_600L, 21_600L, 86_400L, 604_800L)
        private val secureRandom = SecureRandom()

        fun hashToken(token: String): String =
            HexFormat.of().formatHex(
                MessageDigest
                    .getInstance("SHA-256")
                    .digest(token.toByteArray(StandardCharsets.UTF_8)),
            )

        private fun generateRawToken(): String {
            val bytes = ByteArray(32)
            secureRandom.nextBytes(bytes)
            return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        }

        private fun externalContentPath(
            fileId: Long,
            token: String,
        ): String =
            "/system/api/v1/public/cloud/files/$fileId/playback?token=" +
                URLEncoder.encode(token, StandardCharsets.UTF_8)

        private fun externalSharePath(
            fileId: Long,
            token: String,
        ): String =
            "/system/api/v1/public/cloud/files/$fileId/share?token=" +
                URLEncoder.encode(token, StandardCharsets.UTF_8)
    }
}
