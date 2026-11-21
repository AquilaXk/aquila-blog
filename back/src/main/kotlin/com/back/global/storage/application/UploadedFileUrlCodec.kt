package com.back.global.storage.application

import com.back.global.app.AppConfig
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/**
 * 업로드 이미지/파일 URL 인코딩·디코딩 및 본문 내 오브젝트 키 추출 코덱.
 *
 * 참조 구현 노트: ASCII 128-entry 비트마스크 LUT + 단일 패스 `/post/api/v1/` 접두 스캐너 및
 * RFC 3986 / S3 호환 UTF-8 percent-encoder를 적용해 정규식 재컴파일과 다중 패스 스캔을 제거한다.
 */
object UploadedFileUrlCodec {
    private const val COMMON_API_PREFIX = "/post/api/v1/"
    private const val IMAGE_SUFFIX = "images/"
    private const val FILE_SUFFIX = "files/"
    private const val IMAGE_PATH_PREFIX = "$COMMON_API_PREFIX$IMAGE_SUFFIX"
    private const val FILE_PATH_PREFIX = "$COMMON_API_PREFIX$FILE_SUFFIX"

    private const val FLAG_STOP = 1
    private const val FLAG_REL_PREV_BOUNDARY = 2
    private const val FLAG_UNENCODED_KEY_CHAR = 4

    private val HEX_DIGITS = charArrayOf('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F')
    private val EMPTY_PARTITIONED_KEYS = PartitionedObjectKeys(emptySet(), emptySet())

    private val ASCII_CHAR_FLAGS =
        ByteArray(128).apply {
            for (ch in charArrayOf(' ', '\t', '\n', '\r', '\u000B', '\u000C')) {
                this[ch.code] = (this[ch.code].toInt() or FLAG_STOP or FLAG_REL_PREV_BOUNDARY).toByte()
            }
            for (ch in charArrayOf(')', '"', '\'', '>')) {
                this[ch.code] = (this[ch.code].toInt() or FLAG_STOP).toByte()
            }
            for (ch in charArrayOf('(', '"', '\'', '>', '[')) {
                this[ch.code] = (this[ch.code].toInt() or FLAG_REL_PREV_BOUNDARY).toByte()
            }
            for (ch in 'a'..'z') this[ch.code] = (this[ch.code].toInt() or FLAG_UNENCODED_KEY_CHAR).toByte()
            for (ch in 'A'..'Z') this[ch.code] = (this[ch.code].toInt() or FLAG_UNENCODED_KEY_CHAR).toByte()
            for (ch in '0'..'9') this[ch.code] = (this[ch.code].toInt() or FLAG_UNENCODED_KEY_CHAR).toByte()
            for (ch in charArrayOf('-', '_', '.', '*', '/')) {
                this[ch.code] = (this[ch.code].toInt() or FLAG_UNENCODED_KEY_CHAR).toByte()
            }
        }

    data class PartitionedObjectKeys(
        val imageKeys: Set<String>,
        val fileKeys: Set<String>,
    ) {
        fun allKeys(): Set<String> =
            when {
                imageKeys.isEmpty() -> fileKeys
                fileKeys.isEmpty() -> imageKeys
                else ->
                    LinkedHashSet<String>(imageKeys.size + fileKeys.size).apply {
                        addAll(imageKeys)
                        addAll(fileKeys)
                    }
            }
    }

    private fun decodeOrNull(encoded: String): String? {
        var needsDecode = false
        for (i in 0 until encoded.length) {
            val ch = encoded[i]
            if (ch == '%' || ch == '+') {
                needsDecode = true
                break
            }
        }
        if (!needsDecode) return encoded
        return runCatching { URLDecoder.decode(encoded, StandardCharsets.UTF_8) }
            .getOrNull()
    }

    fun buildImageUrl(objectKey: String): String = "${AppConfig.siteBackUrl}${buildRelativeImagePath(objectKey)}"

    fun buildFileUrl(objectKey: String): String = "${AppConfig.siteBackUrl}${buildRelativeFilePath(objectKey)}"

    fun buildRelativeImagePath(objectKey: String): String {
        val encodedKey = encodeObjectKey(objectKey)
        return "$IMAGE_PATH_PREFIX$encodedKey"
    }

    fun buildRelativeFilePath(objectKey: String): String {
        val encodedKey = encodeObjectKey(objectKey)
        return "$FILE_PATH_PREFIX$encodedKey"
    }

    private fun encodeObjectKey(objectKey: String): String {
        val len = objectKey.length
        var firstEncode = -1
        for (i in 0 until len) {
            val code = objectKey[i].code
            if (code >= 128 || (ASCII_CHAR_FLAGS[code].toInt() and FLAG_UNENCODED_KEY_CHAR) == 0) {
                firstEncode = i
                break
            }
        }
        if (firstEncode < 0) return objectKey

        val sb = StringBuilder(len + 16)
        sb.append(objectKey, 0, firstEncode)
        var i = firstEncode
        while (i < len) {
            val ch = objectKey[i]
            val cp = ch.code
            if (cp < 0x80) {
                if ((ASCII_CHAR_FLAGS[cp].toInt() and FLAG_UNENCODED_KEY_CHAR) != 0) {
                    sb.append(ch)
                } else if (ch == ' ') {
                    sb.append("%20")
                } else {
                    appendPercentEncodedByte(sb, cp)
                }
                i++
            } else if (cp < 0x800) {
                appendPercentEncodedByte(sb, 0xC0 or (cp ushr 6))
                appendPercentEncodedByte(sb, 0x80 or (cp and 0x3F))
                i++
            } else if (Character.isHighSurrogate(ch)) {
                if (i + 1 < len && Character.isLowSurrogate(objectKey[i + 1])) {
                    val fullCp = Character.toCodePoint(ch, objectKey[i + 1])
                    appendPercentEncodedByte(sb, 0xF0 or (fullCp ushr 18))
                    appendPercentEncodedByte(sb, 0x80 or ((fullCp ushr 12) and 0x3F))
                    appendPercentEncodedByte(sb, 0x80 or ((fullCp ushr 6) and 0x3F))
                    appendPercentEncodedByte(sb, 0x80 or (fullCp and 0x3F))
                    i += 2
                } else {
                    sb.append("%3F")
                    i++
                }
            } else if (Character.isLowSurrogate(ch)) {
                sb.append("%3F")
                i++
            } else {
                appendPercentEncodedByte(sb, 0xE0 or (cp ushr 12))
                appendPercentEncodedByte(sb, 0x80 or ((cp ushr 6) and 0x3F))
                appendPercentEncodedByte(sb, 0x80 or (cp and 0x3F))
                i++
            }
        }
        return sb.toString()
    }

    private fun appendPercentEncodedByte(
        sb: StringBuilder,
        byteValue: Int,
    ) {
        sb.append('%')
        sb.append(HEX_DIGITS[(byteValue ushr 4) and 0xF])
        sb.append(HEX_DIGITS[byteValue and 0xF])
    }

    fun extractObjectKeyFromImageUrl(url: String?): String? = extractObjectKeyFromUrl(url, IMAGE_PATH_PREFIX)

    fun extractObjectKeyFromFileUrl(url: String?): String? = extractObjectKeyFromUrl(url, FILE_PATH_PREFIX)

    fun extractImageObjectKeysFromContent(content: String): Set<String> = extractPartitionedObjectKeysFromContent(content).imageKeys

    fun extractFileObjectKeysFromContent(content: String): Set<String> = extractPartitionedObjectKeysFromContent(content).fileKeys

    private fun extractObjectKeyFromUrl(
        url: String?,
        pathPrefix: String,
    ): String? {
        val normalizedUrl =
            url
                ?.trim()
                ?.substringBefore("?")
                ?.substringBefore("#")
                ?.takeIf(String::isNotBlank)
                ?: return null

        val absolutePrefix = "${AppConfig.siteBackUrl}$pathPrefix"
        val relativePrefix = pathPrefix

        val encodedKey =
            when {
                normalizedUrl.startsWith(absolutePrefix) -> normalizedUrl.removePrefix(absolutePrefix)
                normalizedUrl.startsWith(relativePrefix) -> normalizedUrl.removePrefix(relativePrefix)
                else -> return null
            }

        if (encodedKey.isBlank()) return null
        return decodeOrNull(encodedKey)
    }

    fun extractObjectKeysFromContent(content: String): Set<String> = extractPartitionedObjectKeysFromContent(content).allKeys()

    fun extractPartitionedObjectKeysFromContent(content: String): PartitionedObjectKeys {
        val firstMatch = content.indexOf(COMMON_API_PREFIX)
        if (firstMatch < 0) return EMPTY_PARTITIONED_KEYS

        val len = content.length
        val siteBackUrl = AppConfig.siteBackUrl
        val siteBackLen = siteBackUrl.length
        var imageKeys: LinkedHashSet<String>? = null
        var fileKeys: LinkedHashSet<String>? = null

        var pos = firstMatch
        while (pos >= 0) {
            val afterCommon = pos + COMMON_API_PREFIX.length
            val isImage = content.startsWith(IMAGE_SUFFIX, startIndex = afterCommon)
            val isFile = !isImage && content.startsWith(FILE_SUFFIX, startIndex = afterCommon)
            if (!isImage && !isFile) {
                pos = content.indexOf(COMMON_API_PREFIX, startIndex = afterCommon)
                continue
            }

            val keyStart = afterCommon + if (isImage) IMAGE_SUFFIX.length else FILE_SUFFIX.length
            val validAbsolute =
                siteBackLen > 0 &&
                    pos >= siteBackLen &&
                    content.regionMatches(pos - siteBackLen, siteBackUrl, 0, siteBackLen, ignoreCase = false)
            val validRelative = !validAbsolute && isRelativeBoundary(content, pos)
            if (!validAbsolute && !validRelative) {
                pos = content.indexOf(COMMON_API_PREFIX, startIndex = keyStart)
                continue
            }

            var end = keyStart
            var decodeEnd = -1
            var needsDecode = false
            while (end < len) {
                val ch = content[end]
                val code = ch.code
                if (code < 128 && (ASCII_CHAR_FLAGS[code].toInt() and FLAG_STOP) != 0) break
                if (decodeEnd < 0) {
                    if (ch == '?' || ch == '#') {
                        decodeEnd = end
                    } else if (ch == '%' || ch == '+') {
                        needsDecode = true
                    }
                }
                end++
            }
            val candidateEnd = if (decodeEnd < 0) end else decodeEnd
            if (candidateEnd > keyStart) {
                val rawCandidate = content.substring(keyStart, candidateEnd)
                val decoded = if (needsDecode) decodeOrNull(rawCandidate) else rawCandidate
                if (!decoded.isNullOrBlank()) {
                    if (isImage) {
                        val set = imageKeys ?: LinkedHashSet<String>().also { imageKeys = it }
                        set.add(decoded)
                    } else {
                        val set = fileKeys ?: LinkedHashSet<String>().also { fileKeys = it }
                        set.add(decoded)
                    }
                }
            }
            pos = content.indexOf(COMMON_API_PREFIX, startIndex = end)
        }

        return if (imageKeys == null && fileKeys == null) {
            EMPTY_PARTITIONED_KEYS
        } else {
            PartitionedObjectKeys(
                imageKeys = imageKeys ?: emptySet(),
                fileKeys = fileKeys ?: emptySet(),
            )
        }
    }

    private fun isRelativeBoundary(
        content: String,
        pos: Int,
    ): Boolean {
        if (pos == 0) return true
        val prevCode = content[pos - 1].code
        return prevCode < 128 && (ASCII_CHAR_FLAGS[prevCode].toInt() and FLAG_REL_PREV_BOUNDARY) != 0
    }
}
