package com.back.global.storage.app

import com.back.global.app.AppConfig
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

object UploadedFileUrlCodec {
    private const val IMAGE_PATH_PREFIX = "/post/api/v1/images/"

    fun buildImageUrl(objectKey: String): String = "${AppConfig.siteBackUrl}${buildRelativeImagePath(objectKey)}"

    fun buildRelativeImagePath(objectKey: String): String {
        val encodedKey =
            URLEncoder
                .encode(objectKey, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("%2F", "/")

        return "$IMAGE_PATH_PREFIX$encodedKey"
    }

    fun extractObjectKeyFromImageUrl(url: String?): String? {
        val normalizedUrl =
            url
                ?.trim()
                ?.substringBefore("?")
                ?.takeIf(String::isNotBlank)
                ?: return null

        val absolutePrefix = "${AppConfig.siteBackUrl}$IMAGE_PATH_PREFIX"
        val relativePrefix = IMAGE_PATH_PREFIX

        val encodedKey =
            when {
                normalizedUrl.startsWith(absolutePrefix) -> normalizedUrl.removePrefix(absolutePrefix)
                normalizedUrl.startsWith(relativePrefix) -> normalizedUrl.removePrefix(relativePrefix)
                else -> return null
            }

        if (encodedKey.isBlank()) return null
        return URLDecoder.decode(encodedKey, StandardCharsets.UTF_8)
    }

    fun extractObjectKeysFromContent(content: String): Set<String> {
        if (content.isBlank()) return emptySet()

        val escapedBackUrl = Regex.escape(AppConfig.siteBackUrl)
        val absoluteRegex = Regex("$escapedBackUrl$IMAGE_PATH_PREFIX([^\\s)\"'>]+)")
        val relativeRegex = Regex("${Regex.escape(IMAGE_PATH_PREFIX)}([^\\s)\"'>]+)")

        return buildSet {
            absoluteRegex.findAll(content).forEach { add(URLDecoder.decode(it.groupValues[1], StandardCharsets.UTF_8)) }
            relativeRegex.findAll(content).forEach { add(URLDecoder.decode(it.groupValues[1], StandardCharsets.UTF_8)) }
        }
    }
}
