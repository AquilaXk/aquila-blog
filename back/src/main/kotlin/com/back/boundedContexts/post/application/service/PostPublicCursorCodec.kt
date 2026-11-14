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
        if (sort.isCursorSupported) {
            sort
        } else {
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
        val c0 = value.indexOf(':')
        val c1 = if (c0 >= 0) value.indexOf(':', c0 + 1) else -1
        val c2 = if (c1 >= 0) value.indexOf(':', c1 + 1) else -1
        val c3 = if (c2 >= 0) value.indexOf(':', c2 + 1) else -1
        val c4 = if (c3 >= 0) value.indexOf(':', c3 + 1) else -1
        if (c4 < 0 || value.indexOf(':', c4 + 1) >= 0) {
            throw AppException(ErrorCode.BAD_REQUEST, "cursor 형식이 올바르지 않습니다.")
        }
        return parseVersionedCursor(value, c0, c1, c2, c3, c4, expectedSort)
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
                    Math.addExact(
                        Math.multiplyExact(createdAt.epochSecond, 1_000_000L),
                        (createdAt.nano / 1_000).toLong(),
                    )
                }
            }
        return CursorPostRow(post, sortValue)
    }

    private fun parseVersionedCursor(
        value: String,
        c0: Int,
        c1: Int,
        c2: Int,
        c3: Int,
        c4: Int,
        expectedSort: PostSearchSortType1,
    ): CursorToken {
        val sortValue =
            parseSignedLongRange(value, c1 + 1, c2)
                ?: throw AppException(ErrorCode.BAD_REQUEST, "cursor sortValue 형식이 올바르지 않습니다.")
        val id =
            parseSignedLongRange(value, c2 + 1, c3)
                ?: throw AppException(ErrorCode.BAD_REQUEST, "cursor id 형식이 올바르지 않습니다.")
        val cursorSort = parseSortRange(value, c3 + 1, c4)
        if (cursorSort != expectedSort) {
            throw AppException(
                ErrorCode.BAD_REQUEST,
                "cursor 정렬 모드(${cursorSort.name})가 요청 정렬(${expectedSort.name})과 일치하지 않습니다.",
            )
        }
        val key = cursorKeyring.keyForVersionRange(value, 0, c0, clock.instant().epochSecond)
        val issuedAtEpochSeconds =
            parseCanonicalPositiveDecimalRange(value, c0 + 1, c1)
                ?: throw AppException(ErrorCode.BAD_REQUEST, "cursor issuedAt 형식이 올바르지 않습니다.")
        verifyCursorTokenRange(
            sortValue = sortValue,
            id = id,
            value = value,
            payloadEnd = c4,
            signatureStart = c4 + 1,
            key = key,
            issuedAtEpochSeconds = issuedAtEpochSeconds,
        )
        return CursorToken(sortValue, id, cursorSort)
    }

    private fun parseSortRange(
        value: String,
        start: Int,
        end: Int,
    ): PostSearchSortType1 {
        var sortStart = start
        var sortEnd = end
        while (sortStart < sortEnd && value[sortStart] <= ' ') sortStart++
        while (sortEnd > sortStart && value[sortEnd - 1] <= ' ') sortEnd--
        val sortLen = sortEnd - sortStart
        for (candidate in PostSearchSortType1.entries) {
            val candidateName = candidate.name
            if (candidateName.length == sortLen && value.regionMatches(sortStart, candidateName, 0, sortLen)) {
                return candidate
            }
        }
        throw AppException(ErrorCode.BAD_REQUEST, "cursor 정렬 모드가 올바르지 않습니다.")
    }

    private fun verifyCursorTokenRange(
        sortValue: Long,
        id: Long,
        value: String,
        payloadEnd: Int,
        signatureStart: Int,
        key: CursorKey,
        issuedAtEpochSeconds: Long,
    ) {
        if (sortValue < 0 || id <= 0L) {
            throw AppException(ErrorCode.BAD_REQUEST, "cursor 값이 유효하지 않습니다.")
        }
        var sigStart = signatureStart
        while (sigStart < value.length && value[sigStart] <= ' ') sigStart++
        if (sigStart >= value.length) {
            throw AppException(ErrorCode.BAD_REQUEST, "cursor 서명이 비어 있습니다.")
        }
        val nowEpochSeconds = clock.instant().epochSecond
        if (issuedAtEpochSeconds > nowEpochSeconds || nowEpochSeconds - issuedAtEpochSeconds > MAX_CURSOR_AGE_SECONDS) {
            throw AppException(ErrorCode.BAD_REQUEST, "cursor가 만료되었습니다.")
        }
        val expectedSignatureBytes = signCursorPayloadSlice(value, payloadEnd, key.secretKeySpec)
        val sigLen = value.length - sigStart
        val decodedSignature = decodeRawSignature(value, sigStart, sigLen)
        val isSignatureValid =
            decodedSignature != null &&
                sigLen == CURSOR_ENCODED_SIGNATURE_LENGTH &&
                decodedSignature.size == CURSOR_SIGNATURE_BYTES &&
                MessageDigest.isEqual(expectedSignatureBytes, decodedSignature)
        if (!isSignatureValid) {
            throw AppException(ErrorCode.BAD_REQUEST, "cursor 서명이 유효하지 않습니다.")
        }
    }

    private fun signCursorPayloadSlice(
        value: String,
        payloadEnd: Int,
        secretKeySpec: SecretKeySpec,
    ): ByteArray {
        val mac = Mac.getInstance(CURSOR_HMAC_ALGORITHM)
        mac.init(secretKeySpec)
        val buffer = ByteArray(minOf(payloadEnd.coerceAtLeast(1), 128))
        var pos = 0
        for (index in 0 until payloadEnd) {
            val ch = value[index]
            if (ch.code >= 0x80) {
                return mac.doFinal(value.substring(0, payloadEnd).toByteArray(StandardCharsets.UTF_8)).copyOf(CURSOR_SIGNATURE_BYTES)
            }
            if (pos >= buffer.size) {
                mac.update(buffer, 0, pos)
                pos = 0
            }
            buffer[pos++] = ch.code.toByte()
        }
        if (pos > 0) {
            mac.update(buffer, 0, pos)
        }
        return mac.doFinal().copyOf(CURSOR_SIGNATURE_BYTES)
    }

    private fun decodeRawSignature(
        value: String,
        sigStart: Int,
        sigLen: Int,
    ): ByteArray? {
        if (sigLen != CURSOR_ENCODED_SIGNATURE_LENGTH) return null
        val ascii = ByteArray(sigLen)
        for (index in 0 until sigLen) {
            val code = value[sigStart + index].code
            if (code >= 0x80) return null
            ascii[index] = code.toByte()
        }
        return try {
            Base64.getUrlDecoder().decode(ascii)
        } catch (_: IllegalArgumentException) {
            null
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
        fun keyForVersionRange(
            raw: String,
            start: Int,
            end: Int,
            nowEpochSeconds: Long,
        ): CursorKey {
            val version = parsePublicVersionRange(raw, start, end)
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

            private fun parsePublicVersionRange(
                raw: String,
                start: Int,
                end: Int,
            ): Long =
                parseCanonicalPositiveDecimalRange(raw, start, end)
                    ?: throw AppException(ErrorCode.BAD_REQUEST, "cursor key version이 올바르지 않습니다.")
        }
    }

    companion object {
        private const val CURSOR_HMAC_ALGORITHM = "HmacSHA256"
        private const val CURSOR_SIGNATURE_BYTES = 18
        private const val CURSOR_ENCODED_SIGNATURE_LENGTH = 24
        private const val MIN_CURSOR_SECRET_LENGTH = 32
        private const val MAX_CURSOR_AGE_SECONDS = 86_400L
        private val CANONICAL_POSITIVE_DECIMAL = Regex("[1-9][0-9]*")

        private fun parseCanonicalPositiveDecimalRange(
            raw: String,
            start: Int,
            end: Int,
        ): Long? {
            if (start >= end) return null
            val first = raw[start]
            if (first !in '1'..'9') return null
            var result = (first.code - '0'.code).toLong()
            val overflowThreshold = Long.MAX_VALUE / 10L
            for (index in start + 1 until end) {
                val ch = raw[index]
                if (ch !in '0'..'9') return null
                val digit = ch.code - '0'.code
                if (result > overflowThreshold) return null
                result *= 10L
                if (result > Long.MAX_VALUE - digit) return null
                result += digit
            }
            return result
        }

        private fun parseSignedLongRange(
            raw: String,
            start: Int,
            end: Int,
        ): Long? {
            if (start >= end) return null
            var index = start
            var negative = false
            var limit = -Long.MAX_VALUE
            val first = raw[index]
            if (first < '0') {
                if (first == '-') {
                    negative = true
                    limit = Long.MIN_VALUE
                } else if (first != '+') {
                    return null
                }
                index++
                if (index >= end) return null
            }
            val multmin = limit / 10L
            var result = 0L
            while (index < end) {
                val ch = raw[index++]
                if (ch !in '0'..'9') return null
                val digit = ch.code - '0'.code
                if (result < multmin) return null
                result *= 10L
                if (result < limit + digit) return null
                result -= digit
            }
            return if (negative) result else -result
        }

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
