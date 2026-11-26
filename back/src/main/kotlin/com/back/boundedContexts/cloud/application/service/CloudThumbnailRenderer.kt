package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.global.storage.application.port.output.CloudStoragePort
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.Locale
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import javax.imageio.ImageIO

/**
 * Generates bounded raster thumbnails on demand for cloud image grids/pickers.
 * Uses JDK `ImageIO` (plus `TwelveMonkeys WebP` reader) with subsampled decode and
 * a bounded concurrency semaphore so high-res cloud photos do not spike heap usage.
 */
object CloudThumbnailRenderer {
    private const val MAX_THUMB_EDGE = 480
    private const val MAX_SOURCE_DIMENSION = 16_384
    private const val MAX_SOURCE_PIXELS = 100_000_000L
    private const val MAX_BUFFERED_DECODE_BYTES = 50L * 1024 * 1024
    private const val SUBSAMPLE_TARGET_EDGE = MAX_THUMB_EDGE * 2
    private const val MAX_CONCURRENT_RENDERS = 2
    private const val SEMAPHORE_WAIT_SECONDS = 15L

    private val DECODABLE_THUMB_TYPES =
        setOf(
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/bmp",
        )

    private val RENDER_SEMAPHORE = Semaphore(MAX_CONCURRENT_RENDERS, true)

    fun openThumbnailOrFallback(
        file: CloudFileDto,
        openFull: () -> CloudFileContent,
    ): CloudFileContent {
        val original = openFull()
        val normalizedType =
            file.contentType
                .substringBefore(';')
                .trim()
                .lowercase(Locale.ROOT)
        if (file.mediaKind != CloudFileMediaKind.PHOTO || normalizedType !in DECODABLE_THUMB_TYPES) {
            return original
        }
        val contentLen = original.storedObject.contentLength ?: file.byteSize
        if (contentLen <= 0L || contentLen > MAX_BUFFERED_DECODE_BYTES) {
            return original
        }

        val rawBytes =
            original.storedObject.use { stored ->
                readUpToLimit(stored.inputStream, MAX_BUFFERED_DECODE_BYTES.toInt())
            } ?: return openFull()

        val rendered = renderFromBytes(rawBytes)
        if (rendered == null) {
            return CloudFileContent(
                file = original.file,
                storedObject =
                    CloudStoragePort.StoredObject(
                        inputStream = ByteArrayInputStream(rawBytes),
                        contentType = original.storedObject.contentType,
                        contentLength = rawBytes.size.toLong(),
                        originalFilename = original.storedObject.originalFilename,
                    ),
            )
        }

        val thumbExt = if (rendered.second == "image/png") ".png" else ".jpg"
        val thumbName =
            original.file.originalFilename
                .substringBeforeLast('.', original.file.originalFilename)
                .ifBlank { "thumbnail" } + thumbExt

        return CloudFileContent(
            file = original.file,
            storedObject =
                CloudStoragePort.StoredObject(
                    inputStream = ByteArrayInputStream(rendered.first),
                    contentType = rendered.second,
                    contentLength = rendered.first.size.toLong(),
                    originalFilename = thumbName,
                ),
        )
    }

    internal fun renderFromBytes(
        sourceBytes: ByteArray,
        semaphore: Semaphore = RENDER_SEMAPHORE,
    ): Pair<ByteArray, String>? {
        return try {
            if (!acquireSemaphore(semaphore)) return null
            val imageInput = ImageIO.createImageInputStream(ByteArrayInputStream(sourceBytes)) ?: return null
            imageInput.use { stream ->
                val readers = ImageIO.getImageReaders(stream)
                if (!readers.hasNext()) return null
                val reader = readers.next()
                try {
                    reader.setInput(stream, false, true)
                    val width = reader.getWidth(0)
                    val height = reader.getHeight(0)
                    if (
                        width <= 0 ||
                        height <= 0 ||
                        width > MAX_SOURCE_DIMENSION ||
                        height > MAX_SOURCE_DIMENSION ||
                        width.toLong() * height.toLong() > MAX_SOURCE_PIXELS
                    ) {
                        return null
                    }
                    val maxEdge = maxOf(width, height)
                    val step = maxOf(1, maxEdge / SUBSAMPLE_TARGET_EDGE)
                    val param =
                        reader.defaultReadParam.apply {
                            if (step > 1) setSourceSubsampling(step, step, 0, 0)
                        }
                    val decoded = reader.read(0, param) ?: return null
                    encodeScaled(decoded)
                } finally {
                    reader.dispose()
                }
            }
        } catch (_: Exception) {
            null
        } finally {
            semaphore.release()
        }
    }

    private fun encodeScaled(decoded: BufferedImage): Pair<ByteArray, String>? {
        val srcW = decoded.width.coerceAtLeast(1)
        val srcH = decoded.height.coerceAtLeast(1)
        val scale = minOf(1.0, MAX_THUMB_EDGE.toDouble() / maxOf(srcW, srcH).toDouble())
        val targetW = maxOf(1, (srcW * scale).toInt())
        val targetH = maxOf(1, (srcH * scale).toInt())
        val hasAlpha = decoded.colorModel.hasAlpha()
        val targetType = if (hasAlpha) BufferedImage.TYPE_INT_ARGB else BufferedImage.TYPE_INT_RGB

        val canvas = BufferedImage(targetW, targetH, targetType)
        val g2 = canvas.createGraphics()
        try {
            g2.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
            g2.drawImage(decoded, 0, 0, targetW, targetH, null)
        } finally {
            g2.dispose()
        }

        val format = if (hasAlpha) "png" else "jpeg"
        val mime = if (hasAlpha) "image/png" else "image/jpeg"
        val out = ByteArrayOutputStream(8_192)
        if (!ImageIO.write(canvas, format, out)) return null
        return out.toByteArray() to mime
    }

    private fun acquireSemaphore(semaphore: Semaphore): Boolean =
        try {
            semaphore.tryAcquire(SEMAPHORE_WAIT_SECONDS, TimeUnit.SECONDS)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            false
        }

    private fun readUpToLimit(
        input: java.io.InputStream,
        maxBytes: Int,
    ): ByteArray? {
        val out = ByteArrayOutputStream(minOf(maxBytes, 65_536))
        val buffer = ByteArray(8_192)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            if (out.size() + read > maxBytes) return null
            out.write(buffer, 0, read)
        }
        return out.toByteArray()
    }
}
