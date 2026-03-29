package com.back.global.storage.application

import com.back.global.app.AppConfig
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * UploadedFileUrlCodec는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
object UploadedFileUrlCodec {
    private const val IMAGE_PATH_PREFIX = "/post/api/v1/images/"
    private const val FILE_PATH_PREFIX = "/post/api/v1/files/"

    private fun decodeOrNull(encoded: String): String? =
        runCatching { URLDecoder.decode(encoded, StandardCharsets.UTF_8) }
            .getOrNull()

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
        val encodedKey =
            URLEncoder
                .encode(objectKey, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("%2F", "/")

        return encodedKey
    }

    /**
     * 입력/환경 데이터를 파싱·정규화해 내부 처리에 안전한 값으로 변환합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    fun extractObjectKeyFromImageUrl(url: String?): String? = extractObjectKeyFromUrl(url, IMAGE_PATH_PREFIX)

    fun extractObjectKeyFromFileUrl(url: String?): String? = extractObjectKeyFromUrl(url, FILE_PATH_PREFIX)

    fun extractImageObjectKeysFromContent(content: String): Set<String> = extractObjectKeysFromContent(content, IMAGE_PATH_PREFIX)

    fun extractFileObjectKeysFromContent(content: String): Set<String> = extractObjectKeysFromContent(content, FILE_PATH_PREFIX)

    private fun extractObjectKeyFromUrl(
        url: String?,
        pathPrefix: String,
    ): String? {
        val normalizedUrl =
            url
                ?.trim()
                ?.substringBefore("?")
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

    /**
     * 입력/환경 데이터를 파싱·정규화해 내부 처리에 안전한 값으로 변환합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    fun extractObjectKeysFromContent(content: String): Set<String> =
        extractImageObjectKeysFromContent(content) + extractFileObjectKeysFromContent(content)

    private fun extractObjectKeysFromContent(
        content: String,
        pathPrefix: String,
    ): Set<String> {
        if (content.isBlank()) return emptySet()

        val escapedBackUrl = Regex.escape(AppConfig.siteBackUrl)
        val absoluteRegex = Regex("$escapedBackUrl${Regex.escape(pathPrefix)}([^\\s)\"'>]+)")
        val relativeRegex = Regex("${Regex.escape(pathPrefix)}([^\\s)\"'>]+)")

        return buildSet {
            absoluteRegex.findAll(content).forEach { match ->
                decodeOrNull(match.groupValues[1])?.let(::add)
            }
            relativeRegex.findAll(content).forEach { match ->
                decodeOrNull(match.groupValues[1])?.let(::add)
            }
        }
    }
}
