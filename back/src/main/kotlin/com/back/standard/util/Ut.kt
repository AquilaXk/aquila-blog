package com.back.standard.util

import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import tools.jackson.databind.ObjectMapper
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.StandardCopyOption
import java.util.*
import javax.imageio.ImageIO

object Ut {
    object JWT {
        fun toString(secret: String, expireSeconds: Int, body: Map<String, Any>): String {
            val issuedAt = Date()
            val expiration = Date(issuedAt.time + 1000L * expireSeconds)
            val secretKey = Keys.hmacShaKeyFor(secret.toByteArray())
            return Jwts.builder()
                .claims(body)
                .issuedAt(issuedAt)
                .expiration(expiration)
                .signWith(secretKey)
                .compact()
        }

        fun isValid(secret: String, jwtStr: String): Boolean {
            return try {
                val secretKey = Keys.hmacShaKeyFor(secret.toByteArray())
                Jwts.parser().verifyWith(secretKey).build().parse(jwtStr)
                true
            } catch (_: Exception) {
                false
            }
        }

        fun payload(secret: String, jwtStr: String): Map<String, Any>? {
            return try {
                val secretKey = Keys.hmacShaKeyFor(secret.toByteArray())
                @Suppress("UNCHECKED_CAST")
                Jwts.parser().verifyWith(secretKey).build().parse(jwtStr).payload as Map<String, Any>
            } catch (_: Exception) {
                null
            }
        }
    }

    object JSON {
        lateinit var objectMapper: ObjectMapper

        fun toString(obj: Any, defaultValue: String = ""): String {
            return try {
                objectMapper.writeValueAsString(obj)
            } catch (_: Exception) {
                defaultValue
            }
        }

        inline fun <reified T> fromMap(map: Any?): T {
            return objectMapper.convertValue(map, T::class.java)
        }

        fun <T> fromString(json: String, cls: Class<T>): T {
            return objectMapper.readValue(json, cls)
        }

        inline fun <reified T> fromString(json: String): T {
            return objectMapper.readValue(json, T::class.java)
        }
    }

    object CMD {
        fun run(vararg args: String) {
            val isWindows = System.getProperty("os.name").lowercase(Locale.getDefault()).contains("win")
            val builder = ProcessBuilder(
                args.map { it.replace("{{DOT_CMD}}", if (isWindows) ".cmd" else "") }.toList()
            )
            builder.redirectErrorStream(true)
            val process = builder.start()
            process.inputStream.bufferedReader().useLines { lines -> lines.forEach { println(it) } }
            val exitCode = process.waitFor()
            println("run exit code: $exitCode")
        }

        fun runAsync(vararg args: String) {
            kotlin.concurrent.thread { run(*args) }
        }
    }

    object FILE {
        private val MIME_TYPE_MAP: LinkedHashMap<String, String> = linkedMapOf(
            "application/json" to "json",
            "text/plain" to "txt",
            "text/html" to "html",
            "text/css" to "css",
            "application/javascript" to "js",
            "image/jpeg" to "jpg",
            "image/png" to "png",
            "image/gif" to "gif",
            "image/webp" to "webp",
            "image/svg+xml" to "svg",
            "application/pdf" to "pdf",
            "application/xml" to "xml",
            "application/zip" to "zip",
            "application/gzip" to "gz",
            "application/x-tar" to "tar",
            "application/x-7z-compressed" to "7z",
            "application/vnd.rar" to "rar",
            "audio/mpeg" to "mp3",
            "audio/mp4" to "m4a",
            "audio/x-m4a" to "m4a",
            "audio/wav" to "wav",
            "video/quicktime" to "mov",
            "video/mp4" to "mp4",
            "video/webm" to "webm",
            "video/x-msvideo" to "avi"
        )

        fun getFileExt(filePath: String): String {
            val filename = Path.of(filePath).fileName.toString()
            return if (filename.contains(".")) filename.substring(filename.lastIndexOf('.') + 1) else ""
        }

        fun getFileExtTypeCodeFromFileExt(ext: String): String {
            return when (ext) {
                "jpeg", "jpg", "gif", "png", "svg", "webp" -> "img"
                "mp4", "avi", "mov" -> "video"
                "mp3", "m4a" -> "audio"
                else -> "etc"
            }
        }

        fun copy(filePath: String, newFilePath: String) {
            mkdir(Paths.get(newFilePath).parent.toString())
            Files.copy(Path.of(filePath), Path.of(newFilePath), StandardCopyOption.REPLACE_EXISTING)
        }

        fun mkdir(dirPath: String) {
            val path = Path.of(dirPath)
            if (Files.exists(path)) return
            Files.createDirectories(path)
        }

        fun getContentType(fileExt: String): String {
            return MIME_TYPE_MAP.entries.find { it.value == fileExt }?.key ?: "application/octet-stream"
        }

        fun getMetadata(filePath: String): Map<String, Any> {
            val ext = getFileExt(filePath)
            val fileExtTypeCode = getFileExtTypeCodeFromFileExt(ext)
            return if (fileExtTypeCode == "img") getImgMetadata(filePath) else emptyMap()
        }

        private fun getImgMetadata(filePath: String): Map<String, Any> {
            val metadata = LinkedHashMap<String, Any>()
            try {
                ImageIO.createImageInputStream(File(filePath)).use { input ->
                    val readers = ImageIO.getImageReaders(input)
                    if (!readers.hasNext()) throw IOException("지원되지 않는 이미지 형식: $filePath")
                    val reader = readers.next()
                    reader.input = input
                    metadata["width"] = reader.getWidth(0)
                    metadata["height"] = reader.getHeight(0)
                    reader.dispose()
                }
            } catch (e: IOException) {
                e.printStackTrace()
            }
            return metadata
        }

        fun makeThumbnail(srcFilePath: String, destFilePath: String, maxWidth: Int, maxHeight: Int = maxWidth): Boolean {
            return try {
                val originalImage = ImageIO.read(File(srcFilePath)) ?: return false
                val originalWidth = originalImage.width
                val originalHeight = originalImage.height
                if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
                    copy(srcFilePath, destFilePath)
                    return true
                }
                val widthRatio = maxWidth.toDouble() / originalWidth
                val heightRatio = maxHeight.toDouble() / originalHeight
                val ratio = minOf(widthRatio, heightRatio)
                val newWidth = (originalWidth * ratio).toInt()
                val newHeight = (originalHeight * ratio).toInt()
                val resizedImage = BufferedImage(newWidth, newHeight, BufferedImage.TYPE_INT_RGB)
                val g2d = resizedImage.createGraphics()
                g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
                g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
                g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                g2d.drawImage(originalImage, 0, 0, newWidth, newHeight, null)
                g2d.dispose()
                val destFile = File(destFilePath)
                mkdir(destFile.parent)
                val formatName = getFileExt(destFilePath).lowercase().let { if (it == "jpg") "jpeg" else it }
                ImageIO.write(resizedImage, formatName, destFile)
                true
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }
    }
}
