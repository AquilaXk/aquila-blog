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
import org.springframework.transaction.annotation.Transactional
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.Base64

data class CloudExternalPlaybackTokenDto(
    val fileId: Long,
    val token: String,
    val expiresAt: Instant,
    val contentPath: String,
)

@Service
class CloudExternalPlaybackTokenService(
    private val cloudFileRepository: CloudFileRepositoryPort,
    private val cloudExternalPlaybackTokenRepository: CloudExternalPlaybackTokenRepositoryPort,
    private val cloudStoragePort: CloudStoragePort,
    private val clock: Clock = Clock.systemUTC(),
    @param:Value("\${custom.storage.cloudExternalPlaybackTokenCleanupGraceSeconds:3600}")
    private val cleanupGraceSeconds: Long = 3600,
    private val meterRegistry: MeterRegistry? = null,
) {
    @Transactional
    fun issue(
        ownerMemberId: Long,
        fileId: Long,
    ): CloudExternalPlaybackTokenDto {
        val file =
            try {
                findVideoFile(ownerMemberId, fileId)
            } catch (ex: AppException) {
                CloudMediaMetrics.recordTokenOperation(meterRegistry, op = "denied")
                throw ex
            }
        val rawToken = generateRawToken()
        val expiresAt = clock.instant().plus(TOKEN_TTL)
        cloudExternalPlaybackTokenRepository.save(
            CloudExternalPlaybackToken.create(
                tokenHash = hashToken(rawToken),
                fileId = file.id,
                memberId = file.ownerMemberId,
                purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                expiresAt = expiresAt,
            ),
        )
        CloudMediaMetrics.recordTokenOperation(meterRegistry, op = "issued")

        return CloudExternalPlaybackTokenDto(
            fileId = file.id,
            token = rawToken,
            expiresAt = expiresAt,
            contentPath = externalContentPath(file.id, rawToken),
        )
    }

    @Transactional(readOnly = true)
    fun getFile(
        token: String,
        fileId: Long,
    ): CloudFileDto = resolveTokenFile(token, fileId).toDto()

    @Transactional(readOnly = true)
    fun openContent(
        token: String,
        fileId: Long,
    ): CloudFileContent {
        val file = resolveTokenFile(token, fileId)
        val storedObject =
            cloudStoragePort.open(file.objectKey)
                ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")

        return CloudFileContent(
            file = file.toDto(),
            storedObject = storedObject,
        )
    }

    @Transactional(readOnly = true)
    fun openContentRange(
        token: String,
        fileId: Long,
        range: LongRange,
    ): CloudFileContent {
        val file = resolveTokenFile(token, fileId)
        val storedObject =
            cloudStoragePort.openRange(file.objectKey, range)
                ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")

        return CloudFileContent(
            file = file.toDto(),
            storedObject = storedObject,
        )
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

    private fun findVideoFile(
        ownerMemberId: Long,
        fileId: Long,
    ): CloudFile {
        val file =
            cloudFileRepository.findActiveByIdAndOwner(fileId, ownerMemberId)
                ?: throw AppException(ErrorCode.NOT_FOUND, "클라우드 파일을 찾을 수 없습니다.")
        if (file.mediaKind != CloudFileMediaKind.VIDEO) {
            throw AppException(ErrorCode.BAD_REQUEST, "동영상 파일만 외부 재생할 수 있습니다.")
        }
        return file
    }

    private fun resolveTokenFile(
        token: String,
        fileId: Long,
    ): CloudFile {
        val normalizedToken = token.trim()
        if (normalizedToken.isBlank()) {
            CloudMediaMetrics.recordTokenOperation(meterRegistry, op = "denied")
            throw AppException(ErrorCode.CLOUD_PLAYBACK_DENIED, "외부 재생 token이 올바르지 않거나 만료되었습니다.")
        }
        val playbackToken =
            cloudExternalPlaybackTokenRepository.findValid(
                tokenHash = hashToken(normalizedToken),
                fileId = fileId,
                purpose = CloudExternalPlaybackTokenPurpose.EXTERNAL_PLAYBACK,
                now = clock.instant(),
            )
        if (playbackToken == null) {
            CloudMediaMetrics.recordTokenOperation(meterRegistry, op = "denied")
            throw AppException(ErrorCode.CLOUD_PLAYBACK_DENIED, "외부 재생 token이 올바르지 않거나 만료되었습니다.")
        }

        return try {
            findVideoFile(playbackToken.memberId, fileId)
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
        )

    companion object {
        private val TOKEN_TTL: Duration = Duration.ofHours(6)
        private val secureRandom = SecureRandom()

        fun hashToken(token: String): String =
            MessageDigest
                .getInstance("SHA-256")
                .digest(token.toByteArray(StandardCharsets.UTF_8))
                .joinToString("") { "%02x".format(it) }

        private fun generateRawToken(): String {
            val bytes = ByteArray(32)
            secureRandom.nextBytes(bytes)
            return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        }

        private fun externalContentPath(
            fileId: Long,
            token: String,
        ): String =
            "/system/api/v1/adm/cloud/files/$fileId/external-content?token=" +
                URLEncoder.encode(token, StandardCharsets.UTF_8)
    }
}
