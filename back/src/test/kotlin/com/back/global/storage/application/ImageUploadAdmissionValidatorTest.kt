package com.back.global.storage.application

import com.back.global.exception.application.AppException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.nio.file.Path
import java.util.Base64
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.zip.CRC32
import javax.imageio.ImageIO

@DisplayName("ImageUploadAdmissionValidator 저수준·동시성 검증 테스트")
class ImageUploadAdmissionValidatorTest {
    @TempDir
    lateinit var tempDir: Path

    @Test
    @DisplayName("동시 이미지 디코딩은 세마포어 상한(2)을 초과하지 않는다")
    fun `validate bounds concurrent decodes with semaphore of two`() {
        val activeDecoders = AtomicInteger(0)
        val maxConcurrentDecoders = AtomicInteger(0)
        val gateLatch = CountDownLatch(1)
        val enteredSemaphore = AtomicInteger(0)

        val trackingSemaphore =
            object : Semaphore(2, true) {
                override fun tryAcquire(
                    timeout: Long,
                    unit: TimeUnit,
                ): Boolean {
                    val acquired = super.tryAcquire(timeout, unit)
                    if (acquired) {
                        val active = activeDecoders.incrementAndGet()
                        maxConcurrentDecoders.accumulateAndGet(active, ::maxOf)
                        enteredSemaphore.incrementAndGet()
                        gateLatch.await(3, TimeUnit.SECONDS)
                    }
                    return acquired
                }

                override fun release() {
                    activeDecoders.decrementAndGet()
                    super.release()
                }
            }

        val validator = ImageUploadAdmissionValidator(decodeSemaphore = trackingSemaphore)
        val imagePath = tempDir.resolve("concurrent.png")
        Files.write(imagePath, rasterBytes("png", 64, 64))

        val pool = Executors.newFixedThreadPool(4)
        try {
            val futures =
                (0 until 4).map {
                    pool.submit<ImageUploadAdmissionValidator.ValidatedImage> {
                        validator.validate(imagePath, "image/png")
                    }
                }
            while (enteredSemaphore.get() < 2) {
                Thread.sleep(10)
            }
            Thread.sleep(40)
            assertThat(maxConcurrentDecoders.get()).isEqualTo(2)
            gateLatch.countDown()

            futures.forEach { future ->
                val result = future.get(5, TimeUnit.SECONDS)
                assertThat(result.contentType).isEqualTo("image/png")
            }
            assertThat(maxConcurrentDecoders.get()).isLessThanOrEqualTo(2)
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    @DisplayName("4x4 서브샘플링 디코드에서도 1x1 및 다중 픽셀 JPEG PNG GIF WebP를 모두 허용한다")
    fun `validate supports small and large valid raster images across formats`() {
        val validator = ImageUploadAdmissionValidator()
        val formats =
            listOf(
                Triple("1x1.jpg", "image/jpg", rasterBytes("jpg", 1, 1)),
                Triple("1x1.png", "image/x-png", rasterBytes("png", 1, 1)),
                Triple("16x16.gif", "image/gif", rasterBytes("gif", 16, 16)),
                Triple(
                    "1x1.webp",
                    "image/x-webp",
                    Base64
                        .getDecoder()
                        .decode("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA="),
                ),
            )

        formats.forEach { (filename, declaredType, bytes) ->
            val path = tempDir.resolve(filename)
            Files.write(path, bytes)
            val result = validator.validate(path, declaredType)
            assertThat(result.contentType).isNotBlank()
        }
    }

    @Test
    @DisplayName("SVG 및 손상된 PNG 청크 길이는 매직바이트 또는 BE 청크 워커에서 즉시 차단한다")
    fun `validate rejects fake mime and malformed png chunks fail closed`() {
        val validator = ImageUploadAdmissionValidator()
        val svgPath = tempDir.resolve("xss.png")
        Files.writeString(svgPath, "<svg onload=alert(1)></svg>")
        assertThatThrownBy { validator.validate(svgPath, "image/png") }
            .isInstanceOf(AppException::class.java)

        val validPng = rasterBytes("png", 4, 4)
        val ihdrEnd = 8 + 4 + 4 + 13 + 4
        val actlData = byteArrayOf(0, 0, 0, 1, 0, 0, 0, 0)
        val crcCalculator = CRC32()
        crcCalculator.update("acTL".toByteArray())
        crcCalculator.update(actlData)
        val crc = crcCalculator.value.toInt()
        val apngBuffer = ByteArrayOutputStream()
        apngBuffer.write(validPng, 0, ihdrEnd)
        apngBuffer.write(byteArrayOf(0, 0, 0, 8))
        apngBuffer.write("acTL".toByteArray())
        apngBuffer.write(actlData)
        apngBuffer.write(
            byteArrayOf(
                (crc ushr 24).toByte(),
                (crc ushr 16).toByte(),
                (crc ushr 8).toByte(),
                crc.toByte(),
            ),
        )
        apngBuffer.write(validPng, ihdrEnd, validPng.size - ihdrEnd)
        val apng = apngBuffer.toByteArray()
        val apngPath = tempDir.resolve("anim.png")
        Files.write(apngPath, apng)
        assertThatThrownBy { validator.validate(apngPath, "image/png") }
            .isInstanceOf(AppException::class.java)

        val truncatedNoIend = validPng.copyOf(validPng.size - 12)
        val truncatedPath = tempDir.resolve("no-iend.png")
        Files.write(truncatedPath, truncatedNoIend)
        assertThatThrownBy { validator.validate(truncatedPath, "image/png") }
            .isInstanceOf(AppException::class.java)
    }

    @Test
    @DisplayName("동시성 Semaphore 타임아웃과 인터럽트, 리더 불일치, 손상된 PNG 스트림 경계를 fail-closed 거부한다")
    fun `rejects concurrency exhaustion interrupts mismatched readers and truncated png streams`() {
        val validPng = rasterBytes("png", 2, 2)
        val validPngPath = tempDir.resolve("valid.png")
        Files.write(validPngPath, validPng)

        val timeoutSemaphore =
            object : Semaphore(1) {
                override fun tryAcquire(
                    timeout: Long,
                    unit: java.util.concurrent.TimeUnit,
                ): Boolean = false
            }
        assertThatThrownBy { ImageUploadAdmissionValidator(timeoutSemaphore).validate(validPngPath, "image/png") }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("503")

        val interruptedSemaphore =
            object : Semaphore(1) {
                override fun tryAcquire(
                    timeout: Long,
                    unit: java.util.concurrent.TimeUnit,
                ): Boolean = throw InterruptedException("simulated interrupt")
            }
        try {
            assertThatThrownBy { ImageUploadAdmissionValidator(interruptedSemaphore).validate(validPngPath, "image/png") }
                .isInstanceOf(AppException::class.java)
            assertThat(Thread.currentThread().isInterrupted).isTrue()
        } finally {
            Thread.interrupted()
        }

        val validator = ImageUploadAdmissionValidator()
        assertThat(validator.canonicalFormat("bmp")).isNull()

        fun stubReader(
            formatName: String,
            decodedImage: BufferedImage? = null,
        ): javax.imageio.ImageReader =
            object : javax.imageio.ImageReader(null) {
                override fun getFormatName(): String = formatName

                override fun getNumImages(allowSearch: Boolean): Int = 1

                override fun getWidth(imageIndex: Int): Int = 2

                override fun getHeight(imageIndex: Int): Int = 2

                override fun getImageTypes(imageIndex: Int): MutableIterator<javax.imageio.ImageTypeSpecifier> =
                    mutableListOf<javax.imageio.ImageTypeSpecifier>().iterator()

                override fun getStreamMetadata(): javax.imageio.metadata.IIOMetadata? = null

                override fun getImageMetadata(imageIndex: Int): javax.imageio.metadata.IIOMetadata? = null

                override fun read(
                    imageIndex: Int,
                    param: javax.imageio.ImageReadParam?,
                ): BufferedImage? = decodedImage
            }

        assertThatThrownBy {
            validator.validateWithReaders(validPngPath, "image/png") { listOf(stubReader("jpeg")).iterator() }
        }.isInstanceOf(AppException::class.java)

        assertThatThrownBy {
            validator.validateWithReaders(validPngPath, "image/png") { listOf(stubReader("png", decodedImage = null)).iterator() }
        }.isInstanceOf(AppException::class.java)

        assertThatThrownBy {
            validator.rejectAnimatedPngStream(java.io.ByteArrayInputStream(byteArrayOf(1)), 4L)
        }.isInstanceOf(AppException::class.java)

        assertThatThrownBy {
            validator.rejectAnimatedPngStream(java.io.ByteArrayInputStream(byteArrayOf(1, 2, 3)), 24L)
        }.isInstanceOf(AppException::class.java)

        assertThatThrownBy {
            validator.rejectAnimatedPngStream(java.io.ByteArrayInputStream("NOTAPNG!".toByteArray()), 24L)
        }.isInstanceOf(AppException::class.java)

        val pngHeaderOnly = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 1)
        assertThatThrownBy {
            validator.rejectAnimatedPngStream(java.io.ByteArrayInputStream(pngHeaderOnly), 24L)
        }.isInstanceOf(AppException::class.java)

        val overflowChunk =
            byteArrayOf(
                0x89.toByte(),
                0x50,
                0x4E,
                0x47,
                0x0D,
                0x0A,
                0x1A,
                0x0A,
                0x00,
                0x00,
                0x03,
                0xE7.toByte(),
                't'.code.toByte(),
                'E'.code.toByte(),
                'X'.code.toByte(),
                't'.code.toByte(),
                0,
                0,
                0,
                0,
            )
        assertThatThrownBy {
            validator.rejectAnimatedPngStream(java.io.ByteArrayInputStream(overflowChunk), overflowChunk.size.toLong())
        }.isInstanceOf(AppException::class.java)

        val zeroSkipStream =
            object : java.io.InputStream() {
                private var reads = 0

                override fun skip(n: Long): Long = 0L

                override fun read(): Int = if (reads++ == 0) 0x41 else -1
            }
        assertThatThrownBy {
            ImageUploadAdmissionValidator.skipExact(zeroSkipStream, 2L)
        }.isInstanceOf(java.io.EOFException::class.java)
    }

    private fun rasterBytes(
        format: String,
        width: Int,
        height: Int,
    ): ByteArray {
        val image = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val out = ByteArrayOutputStream()
        check(ImageIO.write(image, format, out)) { "Unsupported test image format: $format" }
        return out.toByteArray()
    }
}
