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
import java.util.concurrent.atomic.AtomicBoolean
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

    @Test
    @DisplayName("getNumImages와 크기 조회도 decodeSemaphore 안에서 실행되며 실패 시 permit을 해제한다")
    fun `validate runs numImages and bounds checks inside decodeSemaphore permit`() {
        val acquiredDuringNumImages = AtomicBoolean(false)
        val acquiredDuringBounds = AtomicBoolean(false)
        val permits = AtomicInteger(2)
        val trackingSemaphore =
            object : Semaphore(2) {
                override fun tryAcquire(
                    timeout: Long,
                    unit: TimeUnit,
                ): Boolean {
                    val ok = super.tryAcquire(timeout, unit)
                    if (ok) permits.decrementAndGet()
                    return ok
                }

                override fun release() {
                    permits.incrementAndGet()
                    super.release()
                }
            }

        val reader =
            object : javax.imageio.ImageReader(null) {
                override fun getFormatName(): String = "gif"

                override fun getNumImages(allowSearch: Boolean): Int {
                    acquiredDuringNumImages.set(permits.get() < 2)
                    return 3
                }

                override fun getWidth(imageIndex: Int): Int {
                    acquiredDuringBounds.set(permits.get() < 2)
                    return 2
                }

                override fun getHeight(imageIndex: Int): Int {
                    acquiredDuringBounds.set(permits.get() < 2)
                    return 2
                }

                override fun getImageTypes(imageIndex: Int): MutableIterator<javax.imageio.ImageTypeSpecifier> =
                    mutableListOf<javax.imageio.ImageTypeSpecifier>().iterator()

                override fun getStreamMetadata(): javax.imageio.metadata.IIOMetadata? = null

                override fun getImageMetadata(imageIndex: Int): javax.imageio.metadata.IIOMetadata? = null

                override fun read(
                    imageIndex: Int,
                    param: javax.imageio.ImageReadParam?,
                ): BufferedImage = BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB)
            }

        val validator = ImageUploadAdmissionValidator(decodeSemaphore = trackingSemaphore)
        val gifFile = tempDir.resolve("animated.gif")
        Files.write(gifFile, rasterBytes("gif", 2, 2))

        assertThatThrownBy {
            validator.validateWithReaders(gifFile, "image/gif") { listOf(reader).iterator() }
        }.isInstanceOf(AppException::class.java)

        assertThat(acquiredDuringNumImages.get()).isTrue()
        assertThat(permits.get()).isEqualTo(2)

        val singleFrameReader =
            object : javax.imageio.ImageReader(null) {
                override fun getFormatName(): String = "png"

                override fun getNumImages(allowSearch: Boolean): Int = 1

                override fun getWidth(imageIndex: Int): Int {
                    acquiredDuringBounds.set(permits.get() < 2)
                    return 2
                }

                override fun getHeight(imageIndex: Int): Int {
                    acquiredDuringBounds.set(permits.get() < 2)
                    return 2
                }

                override fun getImageTypes(imageIndex: Int): MutableIterator<javax.imageio.ImageTypeSpecifier> =
                    mutableListOf<javax.imageio.ImageTypeSpecifier>().iterator()

                override fun getStreamMetadata(): javax.imageio.metadata.IIOMetadata? = null

                override fun getImageMetadata(imageIndex: Int): javax.imageio.metadata.IIOMetadata? = null

                override fun read(
                    imageIndex: Int,
                    param: javax.imageio.ImageReadParam?,
                ): BufferedImage = BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB)
            }

        val validValidator = ImageUploadAdmissionValidator(decodeSemaphore = trackingSemaphore)
        val pngFile = tempDir.resolve("valid.png")
        Files.write(pngFile, rasterBytes("png", 2, 2))
        validValidator.validateWithReaders(pngFile, "image/png") { listOf(singleFrameReader).iterator() }

        assertThat(acquiredDuringBounds.get()).isTrue()
        assertThat(permits.get()).isEqualTo(2)
    }

    @Test
    @DisplayName("WebP 헤더 선검증은 디코더 진입 전에 VP8X 애니메이션·ANIM/ANMF 청크·초대형 차원을 거부한다")
    fun `preScreen rejects animated and oversized webp headers before imageio decode`() {
        val validator = ImageUploadAdmissionValidator()
        val readerCalled = AtomicBoolean(false)
        val failIfCalledReaders: (javax.imageio.stream.ImageInputStream) -> Iterator<javax.imageio.ImageReader> = {
            readerCalled.set(true)
            emptyList<javax.imageio.ImageReader>().iterator()
        }

        val animatedVp8x = buildWebpBytes("VP8X", vp8xPayload(flags = 0x02, width = 120, height = 80))
        val animatedVp8xFile = tempDir.resolve("animated-flag.webp")
        Files.write(animatedVp8xFile, animatedVp8x)
        assertThatThrownBy {
            validator.validateWithReaders(animatedVp8xFile, "image/webp", failIfCalledReaders)
        }.isInstanceOf(AppException::class.java)
        assertThat(readerCalled.get()).isFalse()

        val forgedVp8xWithAnim =
            buildWebpBytes(
                "VP8X" to vp8xPayload(flags = 0x00, width = 120, height = 80),
                "ANIM" to ByteArray(6),
            )
        val forgedAnimFile = tempDir.resolve("forged-anim.webp")
        Files.write(forgedAnimFile, forgedVp8xWithAnim)
        assertThatThrownBy {
            validator.validateWithReaders(forgedAnimFile, "image/webp", failIfCalledReaders)
        }.isInstanceOf(AppException::class.java)
        assertThat(readerCalled.get()).isFalse()

        val oversizedVp8x = buildWebpBytes("VP8X", vp8xPayload(flags = 0x00, width = 5000, height = 5000))
        val oversizedVp8xFile = tempDir.resolve("oversized-vp8x.webp")
        Files.write(oversizedVp8xFile, oversizedVp8x)
        assertThatThrownBy {
            validator.validateWithReaders(oversizedVp8xFile, "image/webp", failIfCalledReaders)
        }.isInstanceOf(AppException::class.java)
        assertThat(readerCalled.get()).isFalse()

        val oversizedVp8l = buildWebpBytes("VP8L", vp8lPayload(width = 5000, height = 100))
        val oversizedVp8lFile = tempDir.resolve("oversized-vp8l.webp")
        Files.write(oversizedVp8lFile, oversizedVp8l)
        assertThatThrownBy {
            validator.validateWithReaders(oversizedVp8lFile, "image/webp", failIfCalledReaders)
        }.isInstanceOf(AppException::class.java)
        assertThat(readerCalled.get()).isFalse()

        val oversizedVp8 = buildWebpBytes("VP8 ", vp8Payload(width = 4097, height = 100))
        val oversizedVp8File = tempDir.resolve("oversized-vp8.webp")
        Files.write(oversizedVp8File, oversizedVp8)
        assertThatThrownBy {
            validator.validateWithReaders(oversizedVp8File, "image/webp", failIfCalledReaders)
        }.isInstanceOf(AppException::class.java)
        assertThat(readerCalled.get()).isFalse()

        val validStaticVp8x =
            buildWebpBytes(
                "VP8X" to vp8xPayload(flags = 0x10, width = 640, height = 480),
                "VP8L" to vp8lPayload(width = 640, height = 480),
            )
        validator.preScreenWebpStream(java.io.ByteArrayInputStream(validStaticVp8x), validStaticVp8x.size.toLong())

        val validVp8 = buildWebpBytes("VP8 ", vp8Payload(width = 320, height = 240))
        validator.preScreenWebpStream(java.io.ByteArrayInputStream(validVp8), validVp8.size.toLong())

        val truncatedRiff = validVp8.copyOf(validVp8.size - 2)
        assertThatThrownBy {
            validator.preScreenWebpStream(java.io.ByteArrayInputStream(truncatedRiff), truncatedRiff.size.toLong())
        }.isInstanceOf(AppException::class.java)

        val oddChunkWebp = buildWebpBytes("VP8L", vp8lPayload(width = 64, height = 64))
        val oddChunkMissingPadByte = oddChunkWebp.copyOf(oddChunkWebp.size - 1)
        validator.preScreenWebpStream(
            java.io.ByteArrayInputStream(oddChunkMissingPadByte),
            oddChunkMissingPadByte.size.toLong(),
        )

        val truncatedOddChunkPayload = oddChunkWebp.copyOf(oddChunkWebp.size - 2)
        writeInt32LEInto(truncatedOddChunkPayload, 4, truncatedOddChunkPayload.size - 8)
        assertThatThrownBy {
            validator.preScreenWebpStream(
                java.io.ByteArrayInputStream(truncatedOddChunkPayload),
                truncatedOddChunkPayload.size.toLong(),
            )
        }.isInstanceOf(AppException::class.java)

        val shortRiffHeaderStream = ByteArray(6)
        assertThatThrownBy {
            validator.preScreenWebpStream(java.io.ByteArrayInputStream(shortRiffHeaderStream), 32L)
        }.isInstanceOf(AppException::class.java)

        val waveInsteadOfWebp =
            byteArrayOf(
                'R'.code.toByte(),
                'I'.code.toByte(),
                'F'.code.toByte(),
                'F'.code.toByte(),
                0x10,
                0x00,
                0x00,
                0x00,
                'W'.code.toByte(),
                'A'.code.toByte(),
                'V'.code.toByte(),
                'E'.code.toByte(),
            ) + ByteArray(12)
        assertThatThrownBy {
            validator.preScreenWebpStream(java.io.ByteArrayInputStream(waveInsteadOfWebp), waveInsteadOfWebp.size.toLong())
        }.isInstanceOf(AppException::class.java)

        val riff12 =
            byteArrayOf(
                'R'.code.toByte(),
                'I'.code.toByte(),
                'F'.code.toByte(),
                'F'.code.toByte(),
                22,
                0,
                0,
                0,
                'W'.code.toByte(),
                'E'.code.toByte(),
                'B'.code.toByte(),
                'P'.code.toByte(),
            )
        val truncatedChunkHeaderStream = riff12 + "VP8 ".toByteArray(Charsets.US_ASCII)
        assertThatThrownBy {
            validator.preScreenWebpStream(java.io.ByteArrayInputStream(truncatedChunkHeaderStream), 30L)
        }.isInstanceOf(AppException::class.java)

        val invalidFirstChunk = buildWebpBytes("JUNK" to ByteArray(4))
        assertThatThrownBy {
            validator.preScreenWebpStream(java.io.ByteArrayInputStream(invalidFirstChunk), invalidFirstChunk.size.toLong())
        }.isInstanceOf(AppException::class.java)

        val truncatedVp8PayloadStream =
            riff12 +
                "VP8 ".toByteArray(Charsets.US_ASCII) +
                byteArrayOf(10, 0, 0, 0) +
                byteArrayOf(0x10, 0x00, 0x00, 0x9D.toByte())
        assertThatThrownBy {
            validator.preScreenWebpStream(java.io.ByteArrayInputStream(truncatedVp8PayloadStream), 30L)
        }.isInstanceOf(AppException::class.java)

        val interframeVp8 = buildWebpBytes("VP8 ", byteArrayOf(0x11, 0x00, 0x00, 0x9D.toByte(), 0x01, 0x2A, 10, 0, 10, 0))
        assertThatThrownBy {
            validator.preScreenWebpStream(java.io.ByteArrayInputStream(interframeVp8), interframeVp8.size.toLong())
        }.isInstanceOf(AppException::class.java)

        val badSignatureVp8 = buildWebpBytes("VP8 ", byteArrayOf(0x10, 0x00, 0x00, 0x00, 0x01, 0x2A, 10, 0, 10, 0))
        assertThatThrownBy {
            validator.preScreenWebpStream(java.io.ByteArrayInputStream(badSignatureVp8), badSignatureVp8.size.toLong())
        }.isInstanceOf(AppException::class.java)

        val riff12Vp8l =
            byteArrayOf(
                'R'.code.toByte(),
                'I'.code.toByte(),
                'F'.code.toByte(),
                'F'.code.toByte(),
                18,
                0,
                0,
                0,
                'W'.code.toByte(),
                'E'.code.toByte(),
                'B'.code.toByte(),
                'P'.code.toByte(),
            )
        val truncatedVp8lStream =
            riff12Vp8l +
                "VP8L".toByteArray(Charsets.US_ASCII) +
                byteArrayOf(5, 0, 0, 0) +
                byteArrayOf(0x2F, 0x00)
        assertThatThrownBy {
            validator.preScreenWebpStream(java.io.ByteArrayInputStream(truncatedVp8lStream), 26L)
        }.isInstanceOf(AppException::class.java)

        val badSignatureVp8l = buildWebpBytes("VP8L", byteArrayOf(0x00, 0x00, 0x00, 0x00, 0x00))
        assertThatThrownBy {
            validator.preScreenWebpStream(java.io.ByteArrayInputStream(badSignatureVp8l), badSignatureVp8l.size.toLong())
        }.isInstanceOf(AppException::class.java)

        val wrongSizeVp8x = buildWebpBytes("VP8X", ByteArray(12))
        assertThatThrownBy {
            validator.preScreenWebpStream(java.io.ByteArrayInputStream(wrongSizeVp8x), wrongSizeVp8x.size.toLong())
        }.isInstanceOf(AppException::class.java)

        val secondChunkVp8x =
            buildWebpBytes(
                "VP8L" to vp8lPayload(width = 16, height = 16),
                "VP8X" to vp8xPayload(flags = 0x00, width = 16, height = 16),
            )
        assertThatThrownBy {
            validator.preScreenWebpStream(java.io.ByteArrayInputStream(secondChunkVp8x), secondChunkVp8x.size.toLong())
        }.isInstanceOf(AppException::class.java)

        val truncatedVp8xStream =
            riff12 +
                "VP8X".toByteArray(Charsets.US_ASCII) +
                byteArrayOf(10, 0, 0, 0) +
                byteArrayOf(0x00, 0x00, 0x00, 0x00)
        assertThatThrownBy {
            validator.preScreenWebpStream(java.io.ByteArrayInputStream(truncatedVp8xStream), 30L)
        }.isInstanceOf(AppException::class.java)
    }

    private fun writeInt32LEInto(
        target: ByteArray,
        offset: Int,
        value: Int,
    ) {
        target[offset] = (value and 0xFF).toByte()
        target[offset + 1] = ((value ushr 8) and 0xFF).toByte()
        target[offset + 2] = ((value ushr 16) and 0xFF).toByte()
        target[offset + 3] = ((value ushr 24) and 0xFF).toByte()
    }

    private fun buildWebpBytes(
        chunkId: String,
        payload: ByteArray,
    ): ByteArray = buildWebpBytes(chunkId to payload)

    private fun buildWebpBytes(vararg chunks: Pair<String, ByteArray>): ByteArray {
        val body = ByteArrayOutputStream()
        body.write("WEBP".toByteArray(Charsets.US_ASCII))
        chunks.forEach { (id, payload) ->
            body.write(id.toByteArray(Charsets.US_ASCII))
            writeInt32LE(body, payload.size)
            body.write(payload)
            if ((payload.size and 1) == 1) body.write(0)
        }
        val bodyBytes = body.toByteArray()
        val full = ByteArrayOutputStream()
        full.write("RIFF".toByteArray(Charsets.US_ASCII))
        writeInt32LE(full, bodyBytes.size)
        full.write(bodyBytes)
        return full.toByteArray()
    }

    private fun vp8xPayload(
        flags: Int,
        width: Int,
        height: Int,
    ): ByteArray {
        val wMinus1 = width - 1
        val hMinus1 = height - 1
        return byteArrayOf(
            flags.toByte(),
            0,
            0,
            0,
            (wMinus1 and 0xFF).toByte(),
            ((wMinus1 ushr 8) and 0xFF).toByte(),
            ((wMinus1 ushr 16) and 0xFF).toByte(),
            (hMinus1 and 0xFF).toByte(),
            ((hMinus1 ushr 8) and 0xFF).toByte(),
            ((hMinus1 ushr 16) and 0xFF).toByte(),
        )
    }

    private fun vp8lPayload(
        width: Int,
        height: Int,
    ): ByteArray {
        val bits = ((height - 1) shl 14) or (width - 1)
        return byteArrayOf(
            0x2F,
            (bits and 0xFF).toByte(),
            ((bits ushr 8) and 0xFF).toByte(),
            ((bits ushr 16) and 0xFF).toByte(),
            ((bits ushr 24) and 0xFF).toByte(),
        )
    }

    private fun vp8Payload(
        width: Int,
        height: Int,
    ): ByteArray =
        byteArrayOf(
            0x10,
            0x00,
            0x00,
            0x9D.toByte(),
            0x01,
            0x2A,
            (width and 0xFF).toByte(),
            ((width ushr 8) and 0x3F).toByte(),
            (height and 0xFF).toByte(),
            ((height ushr 8) and 0x3F).toByte(),
        )

    private fun writeInt32LE(
        out: ByteArrayOutputStream,
        value: Int,
    ) {
        out.write(value and 0xFF)
        out.write((value ushr 8) and 0xFF)
        out.write((value ushr 16) and 0xFF)
        out.write((value ushr 24) and 0xFF)
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
