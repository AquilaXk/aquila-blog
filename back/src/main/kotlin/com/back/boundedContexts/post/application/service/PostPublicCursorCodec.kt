package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.domain.Post
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.standard.dto.post.type1.PostSearchSortType1
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Clock
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

internal class PostPublicCursorCodec(
    cursorSigningSecret: String,
    cursorSigningKeyVersion: String,
    cursorPreviousSigningSecret: String,
    cursorPreviousSigningKeyVersion: String,
    cursorPreviousExpiresAtEpochSeconds: String,
    private val clock: Clock,
) {
    class CursorPostRow(
        val post: Post,
        val sortValue: Long,
    )

    class CursorToken(
        val sortValue: Long,
        val id: Long,
        val sort: PostSearchSortType1,
    )

    private val cursorKeyring =
        CursorKeyring.create(
            currentSecret = cursorSigningSecret,
            currentVersion = cursorSigningKeyVersion,
            previousSecret = cursorPreviousSigningSecret,
            previousVersion = cursorPreviousSigningKeyVersion,
            previousExpiresAtEpochSeconds = cursorPreviousExpiresAtEpochSeconds,
            nowEpochSeconds = clock.instant().epochSecond,
        )

    fun requireCursorSort(sort: PostSearchSortType1): PostSearchSortType1 =
        when (sort) {
            PostSearchSortType1.CREATED_AT,
            PostSearchSortType1.CREATED_AT_ASC,
            PostSearchSortType1.HIT_COUNT,
            PostSearchSortType1.LIKES_COUNT,
            -> sort
            else ->
                throw AppException(
                    ErrorCode.BAD_REQUEST,
                    "커서 조회는 CREATED_AT/HIT_COUNT/LIKES_COUNT 정렬만 지원합니다.",
                )
        }

    fun parseCursor(
        raw: String?,
        expectedSort: PostSearchSortType1,
    ): CursorToken? {
        val value = raw?.trim().orEmpty()
        if (value.isBlank()) return null
        val parts = value.split(":")
        if (parts.size != CURSOR_VERSIONED_PART_COUNT) {
            throw AppException(ErrorCode.BAD_REQUEST, "cursor 형식이 올바르지 않습니다.")
        }
        return parseVersionedCursor(parts, expectedSort)
    }

    fun encodeCursor(
        sortValue: Long,
        id: Long,
        sort: PostSearchSortType1,
    ): String {
        val payload = "${cursorKeyring.current.version}:${clock.instant().epochSecond}:$sortValue:$id:${sort.name}"
        return "$payload:${signCursorPayload(payload, cursorKeyring.current.secretKeySpec)}"
    }

    fun toCursorPostRow(
        post: Post,
        sort: PostSearchSortType1,
        onCoreMappingFailure: (Long, Throwable) -> Unit,
    ): CursorPostRow? {
        val sortValue =
            when (sort) {
                PostSearchSortType1.HIT_COUNT -> post.hitCount.toLong()
                PostSearchSortType1.LIKES_COUNT -> post.likesCount.toLong()
                else -> {
                    val createdAt =
                        try {
                            post.createdAt
                        } catch (exception: UninitializedPropertyAccessException) {
                            onCoreMappingFailure(post.id, exception)
                            return null
                        }
                    createdAt.toEpochMilli()
                }
            }
        return CursorPostRow(post, sortValue)
    }

    private fun parseVersionedCursor(
        parts: List<String>,
        expectedSort: PostSearchSortType1,
    ): CursorToken {
        val sortValue =
            parts[2].toLongOrNull()
                ?: throw AppException(ErrorCode.BAD_REQUEST, "cursor sortValue 형식이 올바르지 않습니다.")
        val id =
            parts[3].toLongOrNull()
                ?: throw AppException(ErrorCode.BAD_REQUEST, "cursor id 형식이 올바르지 않습니다.")
        val cursorSort =
            runCatching { PostSearchSortType1.valueOf(parts[4].trim()) }.getOrElse {
                throw AppException(ErrorCode.BAD_REQUEST, "cursor 정렬 모드가 올바르지 않습니다.")
            }
        if (cursorSort != expectedSort) {
            throw AppException(
                ErrorCode.BAD_REQUEST,
                "cursor 정렬 모드(${cursorSort.name})가 요청 정렬(${expectedSort.name})과 일치하지 않습니다.",
            )
        }
        val key = cursorKeyring.keyForVersion(parts[0], clock.instant().epochSecond)
        val issuedAtEpochSeconds = parseCursorIssuedAt(parts[1])
        verifyCursorToken(
            sortValue = sortValue,
            id = id,
            payload = parts.take(CURSOR_VERSIONED_PART_COUNT - 1).joinToString(":"),
            signature = parts[5],
            key = key,
            issuedAtEpochSeconds = issuedAtEpochSeconds,
        )
        return CursorToken(sortValue, id, cursorSort)
    }

    private fun verifyCursorToken(
        sortValue: Long,
        id: Long,
        payload: String,
        signature: String,
        key: CursorKey,
        issuedAtEpochSeconds: Long,
    ) {
        if (sortValue < 0 || id <= 0L) {
            throw AppException(ErrorCode.BAD_REQUEST, "cursor 값이 유효하지 않습니다.")
        }
        val trimmedSignature = signature.trim()
        if (trimmedSignature.isBlank()) {
            throw AppException(ErrorCode.BAD_REQUEST, "cursor 서명이 비어 있습니다.")
        }
        val nowEpochSeconds = clock.instant().epochSecond
        if (issuedAtEpochSeconds > nowEpochSeconds || nowEpochSeconds - issuedAtEpochSeconds > MAX_CURSOR_AGE_SECONDS) {
            throw AppException(ErrorCode.BAD_REQUEST, "cursor가 만료되었습니다.")
        }
        val expectedSignature = signCursorPayload(payload, key.secretKeySpec)
        val isSignatureValid =
            MessageDigest.isEqual(
                expectedSignature.toByteArray(StandardCharsets.UTF_8),
                trimmedSignature.toByteArray(StandardCharsets.UTF_8),
            )
        if (!isSignatureValid) {
            throw AppException(ErrorCode.BAD_REQUEST, "cursor 서명이 유효하지 않습니다.")
        }
    }

    private fun signCursorPayload(
        payload: String,
        secretKeySpec: SecretKeySpec,
    ): String {
        val mac = Mac.getInstance(CURSOR_HMAC_ALGORITHM)
        mac.init(secretKeySpec)
        val digest = mac.doFinal(payload.toByteArray(StandardCharsets.UTF_8))
        val truncated = digest.copyOf(CURSOR_SIGNATURE_BYTES)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(truncated)
    }

    private fun parseCursorIssuedAt(raw: String): Long {
        if (!CANONICAL_POSITIVE_DECIMAL.matches(raw)) {
            throw AppException(ErrorCode.BAD_REQUEST, "cursor issuedAt 형식이 올바르지 않습니다.")
        }
        return raw.toLongOrNull()
            ?: throw AppException(ErrorCode.BAD_REQUEST, "cursor issuedAt 형식이 올바르지 않습니다.")
    }

    private class CursorKey(
        val version: Long,
        secretBytes: ByteArray,
        val expiresAtEpochSeconds: Long? = null,
    ) {
        val secretKeySpec: SecretKeySpec = SecretKeySpec(secretBytes, CURSOR_HMAC_ALGORITHM)
    }

    private class CursorKeyring private constructor(
        val current: CursorKey,
        private val previous: CursorKey?,
    ) {
        fun keyForVersion(
            rawVersion: String,
            nowEpochSeconds: Long,
        ): CursorKey {
            val version = parsePublicVersion(rawVersion)
            if (version == current.version) return current
            val previousKey = previous
            if (previousKey != null && version == previousKey.version) {
                if (nowEpochSeconds >= requireNotNull(previousKey.expiresAtEpochSeconds)) {
                    throw AppException(ErrorCode.BAD_REQUEST, "cursor key version이 만료되었습니다.")
                }
                return previousKey
            }
            throw AppException(ErrorCode.BAD_REQUEST, "cursor key version이 올바르지 않습니다.")
        }

        companion object {
            fun create(
                currentSecret: String,
                currentVersion: String,
                previousSecret: String,
                previousVersion: String,
                previousExpiresAtEpochSeconds: String,
                nowEpochSeconds: Long,
            ): CursorKeyring {
                val current =
                    CursorKey(
                        version = parseVersion(currentVersion),
                        secretBytes = requireCursorSigningSecret(currentSecret).toByteArray(StandardCharsets.UTF_8),
                    )
                val previousValues = listOf(previousSecret, previousVersion, previousExpiresAtEpochSeconds)
                if (previousValues.all(String::isBlank)) return CursorKeyring(current, null)
                require(previousValues.none(String::isBlank)) {
                    "previous cursor key must provide secret, version, and expiry together"
                }
                val previousVersionValue = parseVersion(previousVersion)
                require(previousVersionValue < current.version) { "previous cursor key version must be lower than current" }
                require(previousSecret != currentSecret) { "previous cursor key must differ from current" }
                val previousExpiry = parseVersion(previousExpiresAtEpochSeconds)
                require(previousExpiry > nowEpochSeconds && previousExpiry <= nowEpochSeconds + MAX_CURSOR_AGE_SECONDS) {
                    "previous cursor key expiry must be within the rotation window"
                }
                return CursorKeyring(
                    current,
                    CursorKey(
                        version = previousVersionValue,
                        secretBytes = requireCursorSigningSecret(previousSecret).toByteArray(StandardCharsets.UTF_8),
                        expiresAtEpochSeconds = previousExpiry,
                    ),
                )
            }

            private fun parseVersion(raw: String): Long {
                require(CANONICAL_POSITIVE_DECIMAL.matches(raw)) {
                    "cursor key version must be a canonical positive decimal"
                }
                return raw.toLongOrNull() ?: throw IllegalArgumentException("cursor key version is out of range")
            }

            private fun parsePublicVersion(raw: String): Long =
                try {
                    parseVersion(raw)
                } catch (exception: IllegalArgumentException) {
                    throw AppException(ErrorCode.BAD_REQUEST, "cursor key version이 올바르지 않습니다.")
                }
        }
    }

    companion object {
        private const val CURSOR_HMAC_ALGORITHM = "HmacSHA256"
        private const val CURSOR_SIGNATURE_BYTES = 18
        private const val CURSOR_VERSIONED_PART_COUNT = 6
        private const val MIN_CURSOR_SECRET_LENGTH = 32
        private const val MAX_CURSOR_AGE_SECONDS = 86_400L
        private val CANONICAL_POSITIVE_DECIMAL = Regex("[1-9][0-9]*")
        private val CURSOR_SECRET_PLACEHOLDER =
            Regex(
                "^(?:NEED_TO|EMPTY$|change_me|change-me|.*example\\.com$|https://www\\.example\\.com|" +
                    "https://api\\.example\\.com|smtp\\.example\\.com|.*<[^>]+>.*|.*sha-<[^>]+>.*)",
                RegexOption.IGNORE_CASE,
            )

        private fun requireCursorSigningSecret(raw: String): String {
            require(raw.isNotBlank()) { "cursor signing secret must be configured" }
            require(raw == raw.trim()) { "cursor signing secret must not include surrounding whitespace" }
            require(raw.length >= MIN_CURSOR_SECRET_LENGTH) {
                "cursor signing secret must be at least $MIN_CURSOR_SECRET_LENGTH characters"
            }
            require(
                !CURSOR_SECRET_PLACEHOLDER.containsMatchIn(raw) &&
                    !raw.contains("change-me", ignoreCase = true),
            ) {
                "cursor signing secret must not use a placeholder"
            }
            return raw
        }
    }
}
