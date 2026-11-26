package com.back.boundedContexts.post.application.service

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import java.net.URI
import java.time.Instant

/**
 * 예약 발행 시각, 연재 시리즈명/순번, 교차 게시 정본 URL의 입력 정규화 및 Fail-Closed 검증.
 */
object PostPublishingMetadataValidator {
    const val MAX_CONTENT_LENGTH = 500_000
    const val MAX_SUMMARY_LENGTH = 300
    const val MAX_SERIES_NAME_LENGTH = 120
    const val MAX_CANONICAL_URL_LENGTH = 2048
    private const val SCHEDULE_LEEWAY_SECONDS = 30L

    data class NormalizedMetadata(
        val scheduledAt: Instant?,
        val seriesName: String?,
        val seriesOrder: Int?,
        val canonicalUrl: String?,
    )

    fun normalizeSeriesName(raw: String?): String? {
        val trimmed = raw?.trim()?.takeIf(String::isNotEmpty) ?: return null
        val collapsed = trimmed.replace(Regex("\\s+"), " ")
        if (collapsed.length > MAX_SERIES_NAME_LENGTH) {
            throw AppException(ErrorCode.BAD_REQUEST, "시리즈 이름은 ${MAX_SERIES_NAME_LENGTH}자를 초과할 수 없습니다.")
        }
        return collapsed
    }

    fun normalizeSeriesOrder(
        order: Int?,
        normalizedSeriesName: String?,
    ): Int? {
        if (normalizedSeriesName == null) return null
        if (order != null && order < 1) {
            throw AppException(ErrorCode.BAD_REQUEST, "시리즈 순번은 1 이상이어야 합니다.")
        }
        return order
    }

    fun normalizeCanonicalUrl(raw: String?): String? {
        val trimmed = raw?.trim()?.takeIf(String::isNotEmpty) ?: return null
        if (trimmed.length > MAX_CANONICAL_URL_LENGTH) {
            throw AppException(ErrorCode.BAD_REQUEST, "정본 URL은 ${MAX_CANONICAL_URL_LENGTH}자를 초과할 수 없습니다.")
        }
        for (ch in trimmed) {
            if (ch <= ' ' || ch == '\u007f') {
                throw AppException(ErrorCode.BAD_REQUEST, "정본 URL에 공백 또는 제어 문자를 포함할 수 없습니다.")
            }
        }
        val parsed =
            try {
                URI(trimmed)
            } catch (exception: Exception) {
                throw AppException(ErrorCode.BAD_REQUEST, "올바른 정본 URL 형식이 아닙니다.", exception)
            }
        val scheme = parsed.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") {
            throw AppException(ErrorCode.BAD_REQUEST, "정본 URL은 http 또는 https 주소만 허용됩니다.")
        }
        if (!parsed.rawUserInfo.isNullOrEmpty() || parsed.rawAuthority?.contains('@') == true || parsed.host.isNullOrBlank()) {
            throw AppException(ErrorCode.BAD_REQUEST, "유효한 호스트를 포함한 정본 URL만 사용할 수 있습니다.")
        }
        return parsed.toASCIIString()
    }

    fun normalizeSchedule(
        published: Boolean,
        requestedScheduledAt: Instant?,
        existingScheduledAt: Instant? = null,
        now: Instant,
    ): Instant? {
        if (published) {
            if (requestedScheduledAt != null) {
                throw AppException(ErrorCode.BAD_REQUEST, "즉시 발행과 예약 발행을 동시에 지정할 수 없습니다.")
            }
            return null
        }
        val resolved = requestedScheduledAt ?: return null
        if (existingScheduledAt == null || resolved != existingScheduledAt) {
            if (resolved.isBefore(now.minusSeconds(SCHEDULE_LEEWAY_SECONDS))) {
                throw AppException(ErrorCode.BAD_REQUEST, "예약 발행 시각은 현재 시각 이후여야 합니다.")
            }
        }
        return resolved
    }

    fun normalizeAll(
        published: Boolean,
        scheduledAt: Instant?,
        existingScheduledAt: Instant? = null,
        seriesName: String?,
        seriesOrder: Int?,
        canonicalUrl: String?,
        now: Instant,
    ): NormalizedMetadata {
        val normalizedSeries = normalizeSeriesName(seriesName)
        val normalizedOrder = normalizeSeriesOrder(seriesOrder, normalizedSeries)
        val normalizedCanonical = normalizeCanonicalUrl(canonicalUrl)
        val normalizedSchedule = normalizeSchedule(published, scheduledAt, existingScheduledAt, now)
        return NormalizedMetadata(
            scheduledAt = normalizedSchedule,
            seriesName = normalizedSeries,
            seriesOrder = normalizedOrder,
            canonicalUrl = normalizedCanonical,
        )
    }
}
