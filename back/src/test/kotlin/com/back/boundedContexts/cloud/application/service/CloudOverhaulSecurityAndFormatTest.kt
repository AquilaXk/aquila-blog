package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.adapter.web.ApiV1AdmCloudController
import com.back.boundedContexts.cloud.config.CloudSecurityConfigurer
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.boundedContexts.cloud.support.InMemoryCloudFileRepository
import com.back.boundedContexts.cloud.support.StubCloudStoragePort
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.exception.config.ExceptionHandler
import com.back.global.observability.ErrorMetrics
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.ImageUploadAdmissionValidator
import com.back.global.storage.application.ImageUploadAdmissionValidator.ImageValidationPolicy
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.mockito.Mockito.mock
import org.springframework.core.MethodParameter
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.test.web.servlet.multipart
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.zip.CRC32
import java.util.zip.GZIPOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.imageio.ImageIO

@DisplayName("클라우드 포맷 확장·아카이브 안전 상한·고해상도·XSS·썸네일 테스트")
class CloudOverhaulSecurityAndFormatTest {
    @TempDir
    lateinit var tempDir: Path

    private val repository = InMemoryCloudFileRepository()
    private val storage = StubCloudStoragePort()
    private val service =
        CloudFileService(
            cloudFileRepository = repository,
            cloudStoragePort = storage,
            cloudStorageProperties = CloudStorageProperties(),
            clock = Clock.fixed(Instant.parse("2026-11-26T00:00:00Z"), ZoneOffset.UTC),
        )

    @Test
    @DisplayName("개인 클라우드는 DOCX XLSX PPTX TAR GZ TGZ 7Z 오디오 UTF8 텍스트 SVG를 시그니처 기반으로 업로드한다")
    fun `cloud upload accepts office archives audio utf8 text and safe svg`() {
        val validDocx = zipBytes("[Content_Types].xml" to "<Types/>", "word/document.xml" to "<w:document/>")
        val validXlsx = zipBytes("[Content_Types].xml" to "<Types/>", "xl/workbook.xml" to "<workbook/>")
        val validPptx = zipBytes("[Content_Types].xml" to "<Types/>", "ppt/presentation.xml" to "<p:presentation/>")
        val validTar = tarBytes("notes/hello.txt", "hello tar\n".toByteArray(StandardCharsets.UTF_8))
        val validTgz = gzipBytes(validTar)
        val valid7z = valid7zHeaderOnly()
        val wavBytes = wavHeaderBytes()
        val flacBytes = "fLaC\u0000\u0000\u0000\u0022".toByteArray(StandardCharsets.US_ASCII)
        val oggBytes = "OggS\u0000\u0002\u0000\u0000\u0000\u0000\u0000\u0000".toByteArray(StandardCharsets.US_ASCII)
        val opusBytes =
            ByteArray(36).apply {
                "OggS".toByteArray(StandardCharsets.US_ASCII).copyInto(this, 0)
                "OpusHead".toByteArray(StandardCharsets.US_ASCII).copyInto(this, 28)
            }
        val mp3Bytes = "ID3\u0003\u0000\u0000\u0000\u0000\u0000\u0000".toByteArray(StandardCharsets.US_ASCII)
        val rawMp3Frame = byteArrayOf(0xFF.toByte(), 0xFB.toByte(), 0x90.toByte(), 0x00)
        val aacAdts = byteArrayOf(0xFF.toByte(), 0xF1.toByte(), 0x50, 0x00)
        val m4aBytes = ftypBytes("M4A ")
        val logBytes = "\u001B[32mINFO\u001B[0m server started\n".toByteArray(StandardCharsets.UTF_8)
        val mdBytes = "# 한글 제목\n\n본문입니다.\n".toByteArray(StandardCharsets.UTF_8)
        val safeSvg =
            (
                "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\">" +
                    "<rect width=\"16\" height=\"16\"/></svg>"
            ).toByteArray()

        val cases =
            listOf(
                Triple("report.docx", "application/octet-stream", validDocx),
                Triple("sheet.xlsx", "application/octet-stream", validXlsx),
                Triple("deck.pptx", "application/octet-stream", validPptx),
                Triple("bundle.tar", "application/x-tar", validTar),
                Triple("bundle.tgz", "application/gzip", validTgz),
                Triple("archive.7z", "application/x-7z-compressed", valid7z),
                Triple("clip.wav", "audio/x-wav", wavBytes),
                Triple("track.flac", "audio/x-flac", flacBytes),
                Triple("voice.ogg", "audio/ogg", oggBytes),
                Triple("chat.opus", "audio/opus", opusBytes),
                Triple("song.mp3", "audio/mpeg", mp3Bytes),
                Triple("raw.mp3", "audio/mpeg", rawMp3Frame),
                Triple("stream.aac", "audio/aac", aacAdts),
                Triple("memo.m4a", "audio/x-m4a", m4aBytes),
                Triple("app.log", "text/plain", logBytes),
                Triple("readme.md", "text/markdown", mdBytes),
                Triple("vector.svg", "image/svg+xml", safeSvg),
            )

        cases.forEach { (name, mime, bytes) ->
            val uploaded =
                service.upload(
                    ownerMemberId = 7L,
                    originalFilename = name,
                    contentType = mime,
                    inputStream = ByteArrayInputStream(bytes),
                    contentLength = bytes.size.toLong(),
                    folderPath = "",
                )
            assertThat(uploaded.id).isPositive()
            if (name.endsWith(".svg")) {
                assertThat(uploaded.mediaKind).isEqualTo(CloudFileMediaKind.PHOTO)
            } else {
                assertThat(uploaded.mediaKind).isEqualTo(CloudFileMediaKind.DOCUMENT)
            }
        }
    }

    @Test
    @DisplayName("동영상 업로드 시 moov wide mdat free skip 원자와 mov mkv를 분리 판별한다")
    fun `video formats support mov mkv and non-ftyp isobmff atoms`() {
        val movBytes = ftypBytes("qt  ")
        val moovStartMp4 = atomBytes("moov", 16)
        val wideStartMov = atomBytes("wide", 8)
        val mdatStartMp4 = atomBytes("mdat", 16)
        val mkvBytes =
            ByteArray(32).apply {
                this[0] = 0x1A
                this[1] = 0x45
                this[2] = 0xDF.toByte()
                this[3] = 0xA3.toByte()
                "matroska".toByteArray(StandardCharsets.US_ASCII).copyInto(this, 8)
            }
        val webmBytes =
            ByteArray(32).apply {
                this[0] = 0x1A
                this[1] = 0x45
                this[2] = 0xDF.toByte()
                this[3] = 0xA3.toByte()
                "webm".toByteArray(StandardCharsets.US_ASCII).copyInto(this, 8)
            }

        val mov = service.upload(7L, "camera.mov", null, "video/quicktime", ByteArrayInputStream(movBytes), movBytes.size.toLong(), "")
        val moov = service.upload(7L, "moov.mp4", null, null, ByteArrayInputStream(moovStartMp4), moovStartMp4.size.toLong(), "")
        val wide = service.upload(7L, "wide.mov", null, null, ByteArrayInputStream(wideStartMov), wideStartMov.size.toLong(), "")
        val mdat = service.upload(7L, "mdat.mp4", null, null, ByteArrayInputStream(mdatStartMp4), mdatStartMp4.size.toLong(), "")
        val mkv = service.upload(7L, "clip.mkv", null, null, ByteArrayInputStream(mkvBytes), mkvBytes.size.toLong(), "")
        val webm = service.upload(7L, "clip.webm", null, null, ByteArrayInputStream(webmBytes), webmBytes.size.toLong(), "")

        assertThat(mov.contentType).isEqualTo("video/quicktime")
        assertThat(moov.contentType).isEqualTo("video/mp4")
        assertThat(wide.contentType).isEqualTo("video/quicktime")
        assertThat(mdat.contentType).isEqualTo("video/mp4")
        assertThat(mkv.contentType).isEqualTo("video/x-matroska")
        assertThat(webm.contentType).isEqualTo("video/webm")
    }

    @Test
    @DisplayName("악의적 ZIP 슬립, 중첩 폭탄, 압축비 폭탄, 7z 오프셋 폭탄, SVG XSS, NUL 바이너리를 Fail-Closed로 차단한다")
    fun `malicious archives xss svg and spoofed binaries are rejected fail closed`() {
        val zipSlip = zipBytes("../escape.txt" to "pwn")
        val nestedBombDepth4 =
            zipBytes(
                "l1.zip" to zipBytes("l2.zip" to zipBytes("l3.zip" to zipBytes("l4.zip" to zipBytes("a.txt" to "deep")))),
            )
        val zipBomb = zipBytes("bomb.bin" to ByteArray(20 * 1024 * 1024) { 0x41 })
        val gzipBomb = gzipBytes(ByteArray(5 * 1024 * 1024) { 0x42 })
        val tarSlip = tarBytes("../evil.sh", "echo pwn".toByteArray())
        val bad7zCrc = valid7zHeaderOnly().apply { this[12] = 0x7F }
        val oob7zOffset = valid7zWithNextHeader(offset = 1024L, size = 10L)
        val xssScriptSvg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".toByteArray()
        val xssEntitySvg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><a href=\"&#106;avascript:alert(1)\"><rect/></a></svg>".toByteArray()
        val nulTxt = "hello\u0000world".toByteArray()
        val invalidUtf8 = byteArrayOf(0xFF.toByte(), 0xFE.toByte(), 0xFD.toByte())

        val badInputs =
            listOf(
                Triple("slip.zip", "application/zip", zipSlip),
                Triple("deep.zip", "application/zip", nestedBombDepth4),
                Triple("bomb.zip", "application/zip", zipBomb),
                Triple("bomb.gz", "application/gzip", gzipBomb),
                Triple("slip.tar", "application/x-tar", tarSlip),
                Triple("badcrc.7z", "application/x-7z-compressed", bad7zCrc),
                Triple("oob.7z", "application/x-7z-compressed", oob7zOffset),
                Triple("xss1.svg", "image/svg+xml", xssScriptSvg),
                Triple("xss2.svg", "image/svg+xml", xssEntitySvg),
                Triple("bin.txt", "text/plain", nulTxt),
                Triple("bad.md", "text/markdown", invalidUtf8),
            )

        badInputs.forEach { (name, mime, bytes) ->
            assertThatThrownBy {
                service.upload(7L, name, null, mime, ByteArrayInputStream(bytes), bytes.size.toLong(), "")
            }.isInstanceOf(AppException::class.java)
        }
        assertThat(repository.savedFiles).isEmpty()
    }

    @Test
    @DisplayName("ImageUploadAdmissionValidator는 CLOUD_PHOTO에서 BMP ICO AVIF 및 애니메이션 WebP를 허용하고 POST_STRICT는 거부한다")
    fun `image validator separates post strict policy and cloud photo policy`() {
        val validator = ImageUploadAdmissionValidator()
        val avifPath = tempDir.resolve("sample.avif").also { Files.write(it, validAvifBytes(1920, 1080)) }
        val icoPath = tempDir.resolve("favicon.ico").also { Files.write(it, validIcoBytes(32, 32)) }
        val bmpPath = tempDir.resolve("photo.bmp").also { Files.write(it, rasterBytes("bmp", 64, 64)) }
        val badAvif = tempDir.resolve("bad.avif").also { Files.write(it, validAvifBytes(20_000, 100)) }

        assertThat(validator.validate(avifPath, "image/avif", ImageValidationPolicy.CLOUD_PHOTO).contentType).isEqualTo("image/avif")
        assertThat(validator.validate(icoPath, "image/x-icon", ImageValidationPolicy.CLOUD_PHOTO).contentType).isEqualTo("image/x-icon")
        assertThat(validator.validate(bmpPath, "image/bmp", ImageValidationPolicy.CLOUD_PHOTO).contentType).isEqualTo("image/bmp")

        assertThatThrownBy { validator.validate(avifPath, "image/avif", ImageValidationPolicy.POST_STRICT) }
            .isInstanceOf(AppException::class.java)
        assertThatThrownBy { validator.validate(icoPath, "image/x-icon", ImageValidationPolicy.POST_STRICT) }
            .isInstanceOf(AppException::class.java)
        assertThatThrownBy { validator.validate(bmpPath, "image/bmp", ImageValidationPolicy.POST_STRICT) }
            .isInstanceOf(AppException::class.java)
        assertThatThrownBy { validator.validate(badAvif, "image/avif", ImageValidationPolicy.CLOUD_PHOTO) }
            .isInstanceOf(AppException::class.java)
    }

    @Test
    @DisplayName("CloudThumbnailRenderer는 대용량 래스터를 480px 이하로 리사이즈하고 SVG나 손상 스트림은 안전 폴백한다")
    fun `thumbnail renderer scales large raster and falls back cleanly on svg or corrupt bytes`() {
        val largePng = rasterBytes("png", 1200, 600, hasAlpha = true)
        val largeJpg = rasterBytes("jpg", 1200, 800, hasAlpha = false)

        val pngThumb = CloudThumbnailRenderer.renderFromBytes(largePng)
        val jpgThumb = CloudThumbnailRenderer.renderFromBytes(largeJpg)

        assertThat(pngThumb).isNotNull()
        assertThat(pngThumb!!.second).isEqualTo("image/png")
        val decodedPng = ImageIO.read(ByteArrayInputStream(pngThumb.first))
        assertThat(decodedPng.width).isEqualTo(480)
        assertThat(decodedPng.height).isEqualTo(240)

        assertThat(jpgThumb).isNotNull()
        assertThat(jpgThumb!!.second).isEqualTo("image/jpeg")

        val svgDto =
            CloudFileDto(
                id = 9L,
                ownerMemberId = 7L,
                originalFilename = "icon.svg",
                contentType = "image/svg+xml",
                byteSize = 12L,
                mediaKind = CloudFileMediaKind.PHOTO,
                folderPath = "",
                createdAt = Instant.now(),
                modifiedAt = Instant.now(),
                checksumSha256 = "svg1",
            )
        val fallbackSvg =
            CloudThumbnailRenderer.openThumbnailOrFallback(svgDto) {
                CloudFileContent(
                    file = svgDto,
                    storedObject =
                        CloudStoragePort.StoredObject(
                            inputStream = ByteArrayInputStream("<svg/>".toByteArray()),
                            contentType = "image/svg+xml",
                            contentLength = 6L,
                            originalFilename = "icon.svg",
                        ),
                )
            }
        assertThat(fallbackSvg.storedObject.contentType).isEqualTo("image/svg+xml")

        val brokenDto = svgDto.copy(id = 10L, originalFilename = "broken.png", contentType = "image/png")
        val fallbackBroken =
            CloudThumbnailRenderer.openThumbnailOrFallback(brokenDto) {
                CloudFileContent(
                    file = brokenDto,
                    storedObject =
                        CloudStoragePort.StoredObject(
                            inputStream = ByteArrayInputStream("not-image".toByteArray()),
                            contentType = "image/png",
                            contentLength = 9L,
                            originalFilename = "broken.png",
                        ),
                )
            }
        assertThat(fallbackBroken.storedObject.inputStream.readAllBytes()).isEqualTo("not-image".toByteArray())

        val okPngDto = brokenDto.copy(id = 11L, originalFilename = "alpha.png", byteSize = largePng.size.toLong())
        val pngThumbRes =
            CloudThumbnailRenderer.openThumbnailOrFallback(okPngDto) {
                CloudFileContent(
                    file = okPngDto,
                    storedObject =
                        CloudStoragePort.StoredObject(
                            inputStream = ByteArrayInputStream(largePng),
                            contentType = "image/png",
                            contentLength = largePng.size.toLong(),
                            originalFilename = "alpha.png",
                        ),
                )
            }
        assertThat(pngThumbRes.storedObject.contentType).isEqualTo("image/png")
        assertThat(pngThumbRes.storedObject.originalFilename).isEqualTo("alpha.png")

        val okJpgDto =
            brokenDto.copy(
                id = 12L,
                originalFilename = "opaque.jpg",
                contentType = "image/jpeg",
                byteSize = largeJpg.size.toLong(),
            )
        val jpgThumbRes =
            CloudThumbnailRenderer.openThumbnailOrFallback(okJpgDto) {
                CloudFileContent(
                    file = okJpgDto,
                    storedObject =
                        CloudStoragePort.StoredObject(
                            inputStream = ByteArrayInputStream(largeJpg),
                            contentType = "image/jpeg",
                            contentLength = largeJpg.size.toLong(),
                            originalFilename = "opaque.jpg",
                        ),
                )
            }
        assertThat(jpgThumbRes.storedObject.contentType).isEqualTo("image/jpeg")

        val oversizedDto = brokenDto.copy(id = 13L, byteSize = 60L * 1024 * 1024)
        val skippedOversize =
            CloudThumbnailRenderer.openThumbnailOrFallback(oversizedDto) {
                CloudFileContent(
                    file = oversizedDto,
                    storedObject =
                        CloudStoragePort.StoredObject(
                            inputStream = ByteArrayInputStream(byteArrayOf(1)),
                            contentType = "image/png",
                            contentLength = null,
                            originalFilename = "huge.png",
                        ),
                )
            }
        assertThat(skippedOversize.storedObject.contentLength).isNull()
    }

    @Test
    @DisplayName("컨테이너·텍스트·AVIF·비디오 헬퍼의 경계 입력과 UTF-8 멀티청크를 검증한다")
    fun `boundary checks across archives utf8 chunks avif compatible brands and video helpers`() {
        val fakeZipNoOffice = zipBytes("other.xml" to "<x/>")
        val badDocx = writeTemp("bad.docx", fakeZipNoOffice)
        val badUnknown = writeTemp("bad.unknown", fakeZipNoOffice)
        assertThat(CloudArchiveAndDocumentInspector.inspectZipOrOffice(badDocx, "docx")).isNull()
        assertThat(CloudArchiveAndDocumentInspector.inspectZipOrOffice(badUnknown, "unknown")).isNull()
        assertThatThrownBy { CloudArchiveAndDocumentInspector.validateSafeArchiveEntryName("bad\u0000name") }
            .isInstanceOf(AppException::class.java)
        assertThatThrownBy { CloudArchiveAndDocumentInspector.validateSafeArchiveEntryName("/etc/passwd") }
            .isInstanceOf(AppException::class.java)

        val badTar = ByteArray(512).apply { this[257] = 'u'.code.toByte() }
        assertThatThrownBy {
            service.upload(
                7L,
                "bad.tar",
                null,
                "application/x-tar",
                ByteArrayInputStream(badTar),
                badTar.size.toLong(),
                "",
            )
        }.isInstanceOf(AppException::class.java)
        val badGz = byteArrayOf(0x1F, 0x8B.toByte(), 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02)
        assertThatThrownBy {
            service.upload(
                7L,
                "bad.gz",
                null,
                "application/gzip",
                ByteArrayInputStream(badGz),
                badGz.size.toLong(),
                "",
            )
        }.isInstanceOf(AppException::class.java)

        val longUtf8 = "가".repeat(5_000).toByteArray(StandardCharsets.UTF_8)
        val uploadedText =
            service.upload(
                7L,
                "notes-no-ext",
                null,
                "text/plain",
                ByteArrayInputStream(longUtf8),
                longUtf8.size.toLong(),
                "",
            )
        assertThat(uploadedText.contentType).isEqualTo("text/plain")

        val badCtrlText = "abc\u0007def".toByteArray(StandardCharsets.UTF_8)
        assertThatThrownBy {
            service.upload(
                7L,
                "ctrl.txt",
                null,
                "text/plain",
                ByteArrayInputStream(badCtrlText),
                badCtrlText.size.toLong(),
                "",
            )
        }.isInstanceOf(AppException::class.java)
        val badUnicodeCtrl = "abc\u0085def".toByteArray(StandardCharsets.UTF_8)
        assertThatThrownBy {
            service.upload(
                7L,
                "c1.txt",
                null,
                "text/plain",
                ByteArrayInputStream(badUnicodeCtrl),
                badUnicodeCtrl.size.toLong(),
                "",
            )
        }.isInstanceOf(AppException::class.java)

        // mif1 major brand + compatible avif brand, plus > 4.2MP high-res subsampling
        val compatAvif = validMif1CompatAvifBytes(2_500, 2_000)
        val validator = ImageUploadAdmissionValidator()
        assertThat(
            validator
                .validate(
                    writeTemp("compat.avif", compatAvif),
                    "image/avif",
                    ImageValidationPolicy.CLOUD_PHOTO,
                ).contentType,
        ).isEqualTo("image/avif")
        val subsampledBmp = rasterBytes("bmp", 2_500, 2_000)
        assertThat(
            validator
                .validate(
                    writeTemp("highres.bmp", subsampledBmp),
                    "image/bmp",
                    ImageValidationPolicy.CLOUD_PHOTO,
                ).contentType,
        ).isEqualTo("image/bmp")

        assertThat(normalizeVideoContentType(null, "clip.m4v")).isEqualTo("video/mp4")
        assertThat(normalizeVideoContentType(null, "clip.mov")).isEqualTo("video/quicktime")
        assertThat(normalizeVideoContentType(null, "clip.mkv")).isEqualTo("video/x-matroska")
        assertThat(isMp4OrQuickTimeContainer(byteArrayOf(0, 0, 0))).isFalse()
        val shortMoov = byteArrayOf(0, 0, 0, 4, 'm'.code.toByte(), 'o'.code.toByte(), 'o'.code.toByte(), 'v'.code.toByte())
        assertThat(isMp4OrQuickTimeContainer(shortMoov)).isFalse()
        assertThat(
            detectEbmlVideoContentType(
                byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte(), 0, 0, 0, 0),
                "video/x-matroska",
            ),
        ).isEqualTo("video/x-matroska")

        assertThat(detectVideoFromSignature(ftypBytes("mp42"))).isEqualTo("video/mp4")
        assertThat(normalizeVideoContentType("video/quicktime", "raw.bin")).isEqualTo("video/quicktime")
        assertThat(normalizeVideoContentType("video/x-matroska", "raw.bin")).isEqualTo("video/x-matroska")
        assertThat(isMp4OrQuickTimeContainer(ftypBytes("avif"))).isFalse()
        assertThat(
            detectEbmlVideoContentType(
                byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte(), 0, 0, 0, 0),
                null,
            ),
        ).isEqualTo("video/webm")

        validator.validateBounds(100, 100)
        validator.validateDecodedPixelCount(100L)
        assertThatThrownBy {
            validator.validate(
                writeTemp("mismatch-declared.png", rasterBytes("png", 4, 4)),
                "image/jpeg",
                ImageValidationPolicy.CLOUD_PHOTO,
            )
        }.isInstanceOf(AppException::class.java)
        assertThat(validator.canonicalFormat("bmp")).isNull()
        assertThat(validator.canonicalFormat("tiff", ImageValidationPolicy.CLOUD_PHOTO)).isNull()
        assertThat(ImageUploadAdmissionValidator.ALLOWED_IMAGE_CONTENT_TYPES).contains("image/jpeg")
        assertThat(ImageUploadAdmissionValidator.detectImageFormatFromHeader(byteArrayOf(0), 1)).isNull()
        val shortWebp = "RIFF\u0008\u0000\u0000\u0000WEBP".toByteArray(StandardCharsets.US_ASCII)
        assertThatThrownBy {
            validator.validate(writeTemp("short.webp", shortWebp), "image/webp", ImageValidationPolicy.CLOUD_PHOTO)
        }.isInstanceOf(AppException::class.java)
        val threeBrandAvif = validMif1ThreeBrandAvifBytes(100, 100)
        assertThat(
            validator.validate(writeTemp("3brand.avif", threeBrandAvif), "image/avif", ImageValidationPolicy.CLOUD_PHOTO).contentType,
        ).isEqualTo("image/avif")
        assertThatThrownBy {
            validator.preScreenWebpStream(ByteArrayInputStream(byteArrayOf(1, 2, 3)), 3L)
        }.isInstanceOf(AppException::class.java)
        val hugeBinaryBmp = binaryBmpBytes(16_000, 5_000)
        assertThat(
            validator
                .validate(
                    writeTemp("huge-subsampled.bmp", hugeBinaryBmp),
                    "image/bmp",
                    ImageValidationPolicy.CLOUD_PHOTO,
                ).contentType,
        ).isEqualTo("image/bmp")

        val badIcoZero = byteArrayOf(0, 0, 1, 0, 0, 0) + ByteArray(16)
        assertThatThrownBy {
            validator.validate(writeTemp("zero.ico", badIcoZero), "image/x-icon", ImageValidationPolicy.CLOUD_PHOTO)
        }.isInstanceOf(AppException::class.java)
        val badIcoOob = validIcoBytes(16, 16).copyOf().apply { this[6 + 12] = 0x7F }
        assertThatThrownBy {
            validator.validate(writeTemp("oob.ico", badIcoOob), "image/x-icon", ImageValidationPolicy.CLOUD_PHOTO)
        }.isInstanceOf(AppException::class.java)

        val zeroBoxAvif = avifWithZeroSizeBox(100, 100)
        assertThat(
            validator
                .validate(writeTemp("zero-box.avif", zeroBoxAvif), "image/avif", ImageValidationPolicy.CLOUD_PHOTO)
                .contentType,
        ).isEqualTo("image/avif")
        val noIspeAvif =
            ftypBytes("avif") +
                ByteBuffer
                    .allocate(8)
                    .putInt(8)
                    .put("free".toByteArray())
                    .array()
        assertThatThrownBy {
            validator.validate(writeTemp("noispe.avif", noIspeAvif), "image/avif", ImageValidationPolicy.CLOUD_PHOTO)
        }.isInstanceOf(AppException::class.java)

        val oversizedPngHeader = validRasterImageBytesPngPatched(17_000, 17_000)
        assertThat(CloudThumbnailRenderer.renderFromBytes(oversizedPngHeader)).isNull()
        val corruptScanlinePng = validRasterImageBytesPngPatched(5_000, 1)
        assertThat(CloudThumbnailRenderer.renderFromBytes(corruptScanlinePng)).isNull()
        val interruptedSem =
            object : java.util.concurrent.Semaphore(2, true) {
                override fun tryAcquire(
                    timeout: Long,
                    unit: java.util.concurrent.TimeUnit,
                ): Boolean = throw InterruptedException("stop")
            }
        assertThat(CloudThumbnailRenderer.renderFromBytes(byteArrayOf(1), interruptedSem)).isNull()
        assertThat(Thread.interrupted()).isTrue()
        assertThat(interruptedSem.availablePermits()).isEqualTo(2)

        val timeoutSem =
            object : java.util.concurrent.Semaphore(2, true) {
                override fun tryAcquire(
                    timeout: Long,
                    unit: java.util.concurrent.TimeUnit,
                ): Boolean = false
            }
        assertThat(CloudThumbnailRenderer.renderFromBytes(validRasterImageBytesPngPatched(32, 32), timeoutSem)).isNull()
        assertThat(timeoutSem.availablePermits()).isEqualTo(2)

        val tooManyStream =
            object : java.io.InputStream() {
                private var remaining = 51 * 1024 * 1024

                override fun read(): Int = if (remaining-- > 0) 0 else -1

                override fun read(
                    b: ByteArray,
                    off: Int,
                    len: Int,
                ): Int {
                    if (remaining <= 0) return -1
                    val n = minOf(len, remaining)
                    remaining -= n
                    return n
                }
            }
        val tinyDto =
            CloudFileDto(
                id = 99L,
                ownerMemberId = 7L,
                originalFilename = "lies.png",
                contentType = "image/png",
                byteSize = 10L,
                mediaKind = CloudFileMediaKind.PHOTO,
                folderPath = "",
                createdAt = Instant.now(),
                modifiedAt = Instant.now(),
            )
        var openCalls = 0
        CloudThumbnailRenderer.openThumbnailOrFallback(tinyDto) {
            openCalls += 1
            CloudFileContent(
                file = tinyDto,
                storedObject =
                    CloudStoragePort.StoredObject(
                        inputStream = if (openCalls == 1) tooManyStream else ByteArrayInputStream(byteArrayOf(1)),
                        contentType = "image/png",
                        contentLength = null,
                        originalFilename = "lies.png",
                    ),
            )
        }
        assertThat(openCalls).isEqualTo(2)

        // Chunk-split UTF-8 (8,191 ASCII bytes + 3-byte Hangul spanning 8192 boundary) & SVG out-of-range entity
        val boundaryUtf8 = ByteArray(8191) { 'a'.code.toByte() } + "가".toByteArray(StandardCharsets.UTF_8)
        assertThat(
            service
                .upload(
                    7L,
                    "boundary.txt",
                    null,
                    "text/plain",
                    ByteArrayInputStream(boundaryUtf8),
                    boundaryUtf8.size.toLong(),
                    "",
                ).contentType,
        ).isEqualTo("text/plain")

        val outOfRangeEntitySvg =
            "<svg xmlns=\"http://www.w3.org/2000/svg\"><title>&#x999999;&#38;#106;</title><rect/></svg>".toByteArray()
        assertThat(
            service
                .upload(
                    7L,
                    "entity.svg",
                    null,
                    "image/svg+xml",
                    ByteArrayInputStream(outOfRangeEntitySvg),
                    outOfRangeEntitySvg.size.toLong(),
                    "",
                ).contentType,
        ).isEqualTo("image/svg+xml")

        assertThat(
            CloudArchiveAndDocumentInspector.inspect7z(
                writeTemp("short.7z", byteArrayOf(1)),
                byteArrayOf(1),
                1,
            ),
        ).isFalse()
        assertThat(
            CloudArchiveAndDocumentInspector.inspect7z(
                writeTemp("badmagic.7z", ByteArray(32)),
                ByteArray(32),
                32,
            ),
        ).isFalse()
        assertThat(CloudArchiveAndDocumentInspector.inspectGzip(writeTemp("short.gz", byteArrayOf(1)), "gz")).isFalse()
        val badGzipMethod = byteArrayOf(0x1F, 0x8B.toByte(), 0x09, 0x00, 0, 0, 0, 0, 0, 0, 0, 0)
        assertThat(CloudArchiveAndDocumentInspector.inspectGzip(writeTemp("badmethod.gz", badGzipMethod), "gz")).isFalse()
        val plainTextGz = writeTemp("plain.gz", gzipBytes("plain gzip content\n".toByteArray()))
        assertThat(CloudArchiveAndDocumentInspector.inspectGzip(plainTextGz, "gz")).isTrue()
        assertThatThrownBy {
            CloudArchiveAndDocumentInspector.inspectGzip(plainTextGz, "gz", maxDecompressedBytes = 5L)
        }.isInstanceOf(AppException::class.java)
        assertThat(CloudArchiveAndDocumentInspector.inspectTar(writeTemp("short.tar", byteArrayOf(1)))).isFalse()

        val truncZipBytes =
            ByteArray(30).apply {
                this[0] = 0x50
                this[1] = 0x4B
                this[2] = 0x03
                this[3] = 0x04
            }
        val truncatedZip = writeTemp("trunc30.zip", truncZipBytes)
        assertThat(CloudArchiveAndDocumentInspector.inspectZipOrOffice(truncatedZip, "zip")).isNull()
        val normalZipFile = writeTemp("normal.zip", zipBytes("a.txt" to "hello world", "b.txt" to "second"))
        assertThatThrownBy {
            CloudArchiveAndDocumentInspector.inspectZipOrOffice(normalZipFile, "zip", maxEntries = 1, maxUncompressedBytes = 10_000L)
        }.isInstanceOf(AppException::class.java)
        assertThatThrownBy {
            CloudArchiveAndDocumentInspector.inspectZipOrOffice(normalZipFile, "zip", maxEntries = 10, maxUncompressedBytes = 2L)
        }.isInstanceOf(AppException::class.java)
        val nestedInnerZipBytes = zipBytes("a.txt" to "hello world payload", "b.txt" to "second")
        val nestedOuterZipFile = writeTemp("nested-outer.zip", zipBytes("inner.zip" to nestedInnerZipBytes))
        assertThatThrownBy {
            CloudArchiveAndDocumentInspector.inspectZipOrOffice(
                nestedOuterZipFile,
                "zip",
                maxEntries = 2,
                maxUncompressedBytes = 20_000L,
            )
        }.isInstanceOf(AppException::class.java)
        assertThatThrownBy {
            CloudArchiveAndDocumentInspector.inspectZipOrOffice(
                nestedOuterZipFile,
                "zip",
                maxEntries = 10,
                maxUncompressedBytes = nestedInnerZipBytes.size.toLong() + 5L,
            )
        }.isInstanceOf(AppException::class.java)

        val randomSibling = ByteArray(40_000).also { java.util.Random(42L).nextBytes(it) }
        val tinyNestedZip = zipBytes("ok.txt" to "hi")
        val siblingAndTinyNested =
            writeTemp(
                "sibling-nested.zip",
                zipBytes("pad.bin" to randomSibling, "inner.zip" to tinyNestedZip),
            )
        assertThat(
            CloudArchiveAndDocumentInspector.inspectZipOrOffice(
                siblingAndTinyNested,
                "zip",
                maxEntries = 100,
                maxUncompressedBytes = 1_000_000L,
                ratioThresholdBytes = 1_024L,
            ),
        ).isEqualTo("application/zip")

        val largeInnerPayload = ByteArray(12_000).also { java.util.Random(7L).nextBytes(it) }
        val largeNestedZipBytes = zipBytes("inner.bin" to largeInnerPayload)
        val largeNestedOuterFile = writeTemp("large-nested.zip", zipBytes("nested.zip" to largeNestedZipBytes))
        assertThatThrownBy {
            CloudArchiveAndDocumentInspector.inspectZipOrOffice(
                largeNestedOuterFile,
                "zip",
                maxEntries = 100,
                maxUncompressedBytes = 1_000_000L,
                ratioThresholdBytes = 1_024L,
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("중첩 아카이브 크기가 허용 검사 상한을 초과했습니다.")

        val fakeNestedZipBytes =
            ByteArray(12_000).apply {
                java.util.Random(9L).nextBytes(this)
                this[0] = 0
            }
        val fakeNestedOuterFile = writeTemp("fake-nested.zip", zipBytes("fake.zip" to fakeNestedZipBytes))
        assertThat(
            CloudArchiveAndDocumentInspector.inspectZipOrOffice(
                fakeNestedOuterFile,
                "zip",
                maxEntries = 100,
                maxUncompressedBytes = 1_000_000L,
                ratioThresholdBytes = 1_024L,
            ),
        ).isEqualTo("application/zip")
        val smallTar = writeTemp("two.tar", tarBytes("a.txt", "hello".toByteArray()))
        assertThatThrownBy {
            CloudArchiveAndDocumentInspector.inspectTar(smallTar, maxEntries = 0)
        }.isInstanceOf(AppException::class.java)

        val paddedSizeTar = tarBytesWithRawSize("big.bin", " 7777777777\u0000")
        assertThatThrownBy {
            CloudArchiveAndDocumentInspector.inspectTar(writeTemp("bigtar.tar", paddedSizeTar))
        }.isInstanceOf(AppException::class.java)

        val truncatedGzipBody = byteArrayOf(0x1F, 0x8B.toByte(), 0x08, 0x00, 0, 0, 0, 0, 0, 0, 0x03, 0x00)
        assertThat(CloudArchiveAndDocumentInspector.inspectGzip(writeTemp("trunc.gz", truncatedGzipBody), "gz")).isFalse()

        val invalidOctalTar = tarBytes("ok.txt", "a".toByteArray()).apply { this[124] = '9'.code.toByte() }
        // fix tar checksum for invalid octal byte at 124
        for (i in 148..155) invalidOctalTar[i] = ' '.code.toByte()
        var s = 0
        for (i in 0 until 512) s += invalidOctalTar[i].toInt() and 0xFF
        s
            .toString(8)
            .padStart(6, '0')
            .toByteArray(StandardCharsets.US_ASCII)
            .copyInto(invalidOctalTar, 148)
        invalidOctalTar[154] = 0
        invalidOctalTar[155] = ' '.code.toByte()
        assertThat(CloudArchiveAndDocumentInspector.inspectTar(writeTemp("badoctal.tar", invalidOctalTar))).isFalse()

        assertThat(
            com.back.boundedContexts.cloud.adapter.web.ApiV1AdmCloudController
                .IssueCloudExternalTokenReqBody()
                .ttlSeconds,
        ).isNull()

        CloudSecurityConfigurer().configure(
            org.mockito.Mockito.mock(org.springframework.security.config.annotation.web.AuthorizeHttpRequestsDsl::class.java),
        )
    }

    @Test
    @DisplayName("암호화·비UTF8·손상 중첩 ZIP, 잘린 TAR, 네임스페이스 SVG XSS, AVIF 64비트 오버플로, 다중 TGZ 경로 순회를 400 Fail-Closed 거부한다")
    fun `rejects encrypted malformed zip truncated tar ns svg xss avif64 overflow and multi tgz slip with bad request`() {
        val encryptedZip = encryptedZipBytes("secret.txt", "classified".toByteArray(StandardCharsets.UTF_8))
        val nonUtf8LocalZip = nonUtf8LocalEntryZipBytes()
        val truncatedNestedZip =
            zipBytes(
                "nested.zip" to byteArrayOf(0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00),
            )
        val inner25 =
            ByteArray(25).apply {
                this[0] = 0x50
                this[1] = 0x4B
                this[2] = 0x03
                this[3] = 0x04
            }
        val truncated25NestedZip = zipBytes("nested.zip" to inner25)
        val validInnerZip = zipBytes("payload.txt" to "hello world payload for deflate")
        val truncatedDeflateNestedZip =
            zipBytes(
                "nested.zip" to validInnerZip.copyOf(validInnerZip.size / 2),
            )
        val encryptedNestedZip = zipBytes("nested.zip" to encryptedZip)
        val nonUtf8NestedZip = zipBytes("nested.zip" to nonUtf8LocalZip)

        val truncatedTar512 = tarHeaderBlock("truncated.bin", 1024L)
        val truncatedTar1024 =
            tarHeaderBlock("first.txt", 0L) + tarHeaderBlock("second-truncated.bin", 2048L)
        val truncatedTgz = gzipBytes(truncatedTar512)

        val nsScriptSvg =
            (
                "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:h=\"http://www.w3.org/1999/xhtml\">" +
                    "<h:script>alert(1)</h:script></svg>"
            ).toByteArray()
        val nsForeignObjectSvg =
            (
                "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:x=\"http://www.w3.org/2000/svg\">" +
                    "<x:foreignObject><body/></x:foreignObject></svg>"
            ).toByteArray()
        val nsIframeSvg =
            (
                "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:x=\"http://www.w3.org/1999/xhtml\">" +
                    "<x:iframe src=\"https://evil.example\"/></svg>"
            ).toByteArray()
        val nsDotScriptSvg =
            (
                "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:a.b=\"http://www.w3.org/1999/xhtml\">" +
                    "<a.b:script>alert(1)</a.b:script></svg>"
            ).toByteArray()

        val secondEntrySlipTar =
            multiEntryTarBytes(
                TarTestEntry("safe/readme.txt", "ok\n".toByteArray()),
                TarTestEntry("../escape.sh", "echo pwn\n".toByteArray()),
            )
        val secondEntryPrefixSlipTar =
            multiEntryTarBytes(
                TarTestEntry("safe/readme.txt", "ok\n".toByteArray()),
                TarTestEntry("escape.sh", "echo pwn\n".toByteArray(), prefix = "../evil"),
            )
        val badSecondChecksumTar =
            multiEntryTarBytes(
                TarTestEntry("safe/readme.txt", "ok\n".toByteArray()),
                TarTestEntry("safe/second.txt", "hi\n".toByteArray()),
            ).apply {
                this[1024 + 10] = 'X'.code.toByte()
            }
        val secondSlipTgz = gzipBytes(secondEntrySlipTar)
        val secondPrefixSlipTgz = gzipBytes(secondEntryPrefixSlipTar)
        val badSecondChecksumTgz = gzipBytes(badSecondChecksumTar)
        val nonUstarTgz = gzipBytes("plain text pretending to be tgz\n".toByteArray())
        val tgzBomb = gzipBytes(multiEntryTarBytes(TarTestEntry("bomb.bin", ByteArray(5 * 1024 * 1024) { 0x43 })))
        val elfSpoofedSh = byteArrayOf(0x7F, 'E'.code.toByte(), 'L'.code.toByte(), 'F'.code.toByte(), 2, 1, 1, 0)

        val badCases =
            listOf(
                Triple("encrypted.zip", "application/zip", encryptedZip),
                Triple("nonutf8-local.zip", "application/zip", nonUtf8LocalZip),
                Triple("corrupt-nested.zip", "application/zip", truncatedNestedZip),
                Triple("corrupt25-nested.zip", "application/zip", truncated25NestedZip),
                Triple("corrupt-deflate-nested.zip", "application/zip", truncatedDeflateNestedZip),
                Triple("encrypted-nested.zip", "application/zip", encryptedNestedZip),
                Triple("nonutf8-nested.zip", "application/zip", nonUtf8NestedZip),
                Triple("truncated-512.tar", "application/x-tar", truncatedTar512),
                Triple("truncated-1024.tar", "application/x-tar", truncatedTar1024),
                Triple("truncated.tgz", "application/gzip", truncatedTgz),
                Triple("ns-script.svg", "image/svg+xml", nsScriptSvg),
                Triple("ns-foreign.svg", "image/svg+xml", nsForeignObjectSvg),
                Triple("ns-iframe.svg", "image/svg+xml", nsIframeSvg),
                Triple("ns-dot-script.svg", "image/svg+xml", nsDotScriptSvg),
                Triple("second-slip.tgz", "application/gzip", secondSlipTgz),
                Triple("second-slip.tar.gz", "application/gzip", secondSlipTgz),
                Triple("second-slip.gzip", "application/gzip", secondSlipTgz),
                Triple("gzip-no-ext", "application/gzip", secondSlipTgz),
                Triple("non-ustar.tgz", "application/gzip", nonUstarTgz),
                Triple("second-prefix-slip.tgz", "application/gzip", secondPrefixSlipTgz),
                Triple("bad-entry2-checksum.tgz", "application/gzip", badSecondChecksumTgz),
                Triple("bomb.tgz", "application/gzip", tgzBomb),
                Triple("spoofed.sh", "text/plain", elfSpoofedSh),
            )

        badCases.forEach { (name, mime, bytes) ->
            val thrown =
                org.junit.jupiter.api.Assertions.assertThrows(AppException::class.java, {
                    service.upload(7L, name, null, mime, ByteArrayInputStream(bytes), bytes.size.toLong(), "")
                }, "Expected BAD_REQUEST for $name")
            assertThat(thrown.errorCode).isEqualTo(ErrorCode.BAD_REQUEST)
            assertThat(thrown.rsData.statusCode).isEqualTo(400)
        }

        val validMultiTgz =
            gzipBytes(
                multiEntryTarBytes(
                    TarTestEntry("notes.txt", "one\n".toByteArray(), prefix = "docs/2026"),
                    TarTestEntry("sub/two.txt", "two\n".toByteArray()),
                ),
            )
        val uploadedMultiTgz =
            service.upload(
                7L,
                "valid-multi.tgz",
                null,
                "application/gzip",
                ByteArrayInputStream(validMultiTgz),
                validMultiTgz.size.toLong(),
                "",
            )
        assertThat(uploadedMultiTgz.contentType).isEqualTo("application/gzip")

        val validSh = "#!/usr/bin/env bash\necho ok\n".toByteArray(StandardCharsets.UTF_8)
        val uploadedSh =
            service.upload(7L, "deploy.sh", null, "application/x-sh", ByteArrayInputStream(validSh), validSh.size.toLong(), "")
        assertThat(uploadedSh.contentType).isEqualTo("text/plain")

        val validator = ImageUploadAdmissionValidator()
        val overflowAvifWrap = avifWith64BitMetaBoxSize(Long.MAX_VALUE - 5L)
        val overflowAvifMax = avifWith64BitMetaBoxSize(Long.MAX_VALUE)
        val overflowAvifMsb = avifWith64BitMetaBoxSize(Long.MIN_VALUE + 32L)
        val overflowAvifAllOnes = avifWith64BitMetaBoxSize(-1L)
        val truncated64Avif =
            ftypBytes("avif") +
                ByteBuffer
                    .allocate(12)
                    .putInt(1)
                    .put("meta".toByteArray())
                    .putInt(0)
                    .array()
        assertThat(ImageUploadAdmissionValidator.extractAvifDimensions(overflowAvifWrap, overflowAvifWrap.size)).isNull()
        assertThat(ImageUploadAdmissionValidator.extractAvifDimensions(overflowAvifMax, overflowAvifMax.size)).isNull()
        assertThat(ImageUploadAdmissionValidator.extractAvifDimensions(overflowAvifMsb, overflowAvifMsb.size)).isNull()
        assertThat(ImageUploadAdmissionValidator.extractAvifDimensions(overflowAvifAllOnes, overflowAvifAllOnes.size)).isNull()
        listOf(
            "overflow-wrap.avif" to overflowAvifWrap,
            "overflow-max.avif" to overflowAvifMax,
            "overflow-msb.avif" to overflowAvifMsb,
            "overflow-neg1.avif" to overflowAvifAllOnes,
            "trunc64.avif" to truncated64Avif,
        ).forEach { (filename, bytes) ->
            assertThatThrownBy {
                validator.validate(writeTemp(filename, bytes), "image/avif", ImageValidationPolicy.CLOUD_PHOTO)
            }.isInstanceOf(AppException::class.java)
                .satisfies({ ex ->
                    assertThat((ex as AppException).errorCode).isEqualTo(ErrorCode.BAD_REQUEST)
                })
        }

        val valid64Avif = validAvifWith64BitMetaBox(128, 96)
        assertThat(
            validator.validate(writeTemp("valid64.avif", valid64Avif), "image/avif", ImageValidationPolicy.CLOUD_PHOTO).contentType,
        ).isEqualTo("image/avif")

        val emptyEocdZip =
            ByteArray(22).apply {
                this[0] = 0x50
                this[1] = 0x4B
                this[2] = 0x05
                this[3] = 0x06
            }
        val outerWithEmptyNested =
            service.upload(
                7L,
                "empty-nested.zip",
                null,
                "application/zip",
                ByteArrayInputStream(zipBytes("empty.zip" to emptyEocdZip)),
                zipBytes("empty.zip" to emptyEocdZip).size.toLong(),
                "",
            )
        assertThat(outerWithEmptyNested.contentType).isEqualTo("application/zip")

        // Real HTTP controller + ExceptionHandler multipart upload verification (HTTP 400, never 500)
        val principal = SecurityUser(7L, "admin", "", "Admin", listOf(SimpleGrantedAuthority("ROLE_ADMIN")))
        val controller =
            ApiV1AdmCloudController(
                cloudFileService = service,
                cloudVideoUploadSessionService = mock(CloudVideoUploadSessionService::class.java),
                cloudExternalPlaybackTokenService = mock(CloudExternalPlaybackTokenService::class.java),
            )
        val mvc =
            MockMvcBuilders
                .standaloneSetup(controller)
                .setControllerAdvice(ExceptionHandler(ErrorMetrics(SimpleMeterRegistry())))
                .setCustomArgumentResolvers(
                    object : HandlerMethodArgumentResolver {
                        override fun supportsParameter(parameter: MethodParameter): Boolean =
                            parameter.parameterType == SecurityUser::class.java

                        override fun resolveArgument(
                            parameter: MethodParameter,
                            mavContainer: ModelAndViewContainer?,
                            webRequest: NativeWebRequest,
                            binderFactory: WebDataBinderFactory?,
                        ): Any = principal
                    },
                ).build()

        listOf(
            Triple("encrypted.zip", "application/zip", encryptedZip),
            Triple("nonutf8-local.zip", "application/zip", nonUtf8LocalZip),
            Triple("corrupt-deflate-nested.zip", "application/zip", truncatedDeflateNestedZip),
            Triple("truncated-512.tar", "application/x-tar", truncatedTar512),
            Triple("ns-script.svg", "image/svg+xml", nsScriptSvg),
            Triple("second-slip.tgz", "application/gzip", secondSlipTgz),
        ).forEach { (filename, mime, payload) ->
            mvc
                .multipart("/system/api/v1/adm/cloud/files") {
                    file(MockMultipartFile("file", filename, mime, payload))
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-1") }
                }
        }
    }

    private fun validMif1ThreeBrandAvifBytes(
        width: Int,
        height: Int,
    ): ByteArray {
        val ftyp =
            ByteBuffer
                .allocate(24)
                .putInt(24)
                .put("ftyp".toByteArray(StandardCharsets.US_ASCII))
                .put("mif1".toByteArray(StandardCharsets.US_ASCII))
                .putInt(0)
                .put("isom".toByteArray(StandardCharsets.US_ASCII))
                .put("avif".toByteArray(StandardCharsets.US_ASCII))
                .array()
        val fullAvif = validAvifBytes(width, height)
        val metaOnly = fullAvif.copyOfRange(16, fullAvif.size)
        return ftyp + metaOnly
    }

    private fun tarBytesWithRawSize(
        name: String,
        octalSizeField: String,
    ): ByteArray {
        val block = ByteArray(512)
        name.toByteArray(StandardCharsets.UTF_8).copyInto(block, 0)
        "0000644\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 100)
        "0000000\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 108)
        "0000000\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 116)
        octalSizeField.take(12).toByteArray(StandardCharsets.US_ASCII).copyInto(block, 124)
        "00000000000\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 136)
        for (i in 148..155) block[i] = ' '.code.toByte()
        block[156] = '0'.code.toByte()
        "ustar\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 257)
        "00".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 263)
        var sum = 0
        for (b in block) sum += b.toInt() and 0xFF
        sum
            .toString(8)
            .padStart(6, '0')
            .toByteArray(StandardCharsets.US_ASCII)
            .copyInto(block, 148)
        block[154] = 0
        block[155] = ' '.code.toByte()
        return block
    }

    private fun binaryBmpBytes(
        width: Int,
        height: Int,
    ): ByteArray {
        val image = BufferedImage(width, height, BufferedImage.TYPE_BYTE_BINARY)
        val out = ByteArrayOutputStream()
        check(ImageIO.write(image, "bmp", out))
        return out.toByteArray()
    }

    private fun validRasterImageBytesPngPatched(
        width: Int,
        height: Int,
    ): ByteArray {
        val bytes = rasterBytes("png", 4, 4, hasAlpha = false).copyOf()
        bytes[16] = (width ushr 24).toByte()
        bytes[17] = (width ushr 16).toByte()
        bytes[18] = (width ushr 8).toByte()
        bytes[19] = width.toByte()
        bytes[20] = (height ushr 24).toByte()
        bytes[21] = (height ushr 16).toByte()
        bytes[22] = (height ushr 8).toByte()
        bytes[23] = height.toByte()
        val crc = CRC32().apply { update(bytes, 12, 17) }.value.toInt()
        ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN).putInt(29, crc)
        return bytes
    }

    private fun avifWithZeroSizeBox(
        width: Int,
        height: Int,
    ): ByteArray {
        val ispe =
            ByteBuffer
                .allocate(20)
                .putInt(20)
                .put("ispe".toByteArray(StandardCharsets.US_ASCII))
                .putInt(0)
                .putInt(width)
                .putInt(height)
                .array()
        val ipco =
            ByteBuffer
                .allocate(8 + ispe.size)
                .putInt(0) // rawSize == 0 -> extends to container end
                .put("ipco".toByteArray())
                .put(ispe)
                .array()
        val iprp =
            ByteBuffer
                .allocate(8 + ipco.size)
                .putInt(8 + ipco.size)
                .put("iprp".toByteArray())
                .put(ipco)
                .array()
        val meta =
            ByteBuffer
                .allocate(12 + iprp.size)
                .putInt(12 + iprp.size)
                .put("meta".toByteArray())
                .putInt(0)
                .put(iprp)
                .array()
        return ftypBytes("avif") + meta
    }

    private fun writeTemp(
        name: String,
        bytes: ByteArray,
    ): Path = tempDir.resolve(name).also { Files.write(it, bytes) }

    private fun validMif1CompatAvifBytes(
        width: Int,
        height: Int,
    ): ByteArray {
        val ftyp =
            ByteBuffer
                .allocate(20)
                .putInt(20)
                .put("ftyp".toByteArray(StandardCharsets.US_ASCII))
                .put("mif1".toByteArray(StandardCharsets.US_ASCII))
                .putInt(0)
                .put("avif".toByteArray(StandardCharsets.US_ASCII))
                .array()
        val fullAvif = validAvifBytes(width, height)
        val metaOnly = fullAvif.copyOfRange(16, fullAvif.size)
        return ftyp + metaOnly
    }

    private fun zipBytes(vararg entries: Pair<String, Any>): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zos ->
            entries.forEach { (name, body) ->
                zos.putNextEntry(ZipEntry(name))
                val bytes =
                    when (body) {
                        is ByteArray -> body
                        else -> body.toString().toByteArray(StandardCharsets.UTF_8)
                    }
                zos.write(bytes)
                zos.closeEntry()
            }
        }
        return out.toByteArray()
    }

    private fun tarBytes(
        name: String,
        payload: ByteArray,
    ): ByteArray {
        val block = ByteArray(512)
        name.toByteArray(StandardCharsets.UTF_8).copyInto(block, 0)
        "0000644\u0000"
            .toByteArray(StandardCharsets.US_ASCII)
            .copyInto(block, 100)
        "0000000\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 108)
        "0000000\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 116)
        payload.size
            .toString(8)
            .padStart(11, '0')
            .toByteArray(StandardCharsets.US_ASCII)
            .copyInto(block, 124)
        "00000000000\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 136)
        for (i in 148..155) block[i] = ' '.code.toByte()
        block[156] = '0'.code.toByte()
        "ustar\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 257)
        "00".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 263)
        var sum = 0
        for (b in block) sum += b.toInt() and 0xFF
        sum
            .toString(8)
            .padStart(6, '0')
            .toByteArray(StandardCharsets.US_ASCII)
            .copyInto(block, 148)
        block[154] = 0
        block[155] = ' '.code.toByte()

        val paddedPayloadLen = ((payload.size + 511) / 512) * 512
        val out = ByteArrayOutputStream()
        out.write(block)
        out.write(payload)
        if (paddedPayloadLen > payload.size) {
            out.write(ByteArray(paddedPayloadLen - payload.size))
        }
        out.write(ByteArray(1024))
        return out.toByteArray()
    }

    private fun gzipBytes(raw: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        GZIPOutputStream(out).use { it.write(raw) }
        return out.toByteArray()
    }

    private fun valid7zHeaderOnly(): ByteArray = valid7zWithNextHeader(offset = 0L, size = 0L)

    private fun valid7zWithNextHeader(
        offset: Long,
        size: Long,
    ): ByteArray {
        val buf = ByteBuffer.allocate(32).order(ByteOrder.LITTLE_ENDIAN)
        buf.put(byteArrayOf(0x37, 0x7A, 0xBC.toByte(), 0xAF.toByte(), 0x27, 0x1C))
        buf.put(0)
        buf.put(4)
        buf.putInt(0) // placeholder for StartHeaderCRC
        buf.putLong(offset)
        buf.putLong(size)
        buf.putInt(0)
        val arr = buf.array()
        val crc =
            CRC32()
                .apply { update(arr, 12, 20) }
                .value
                .toInt()
        ByteBuffer
            .wrap(arr)
            .order(ByteOrder.LITTLE_ENDIAN)
            .putInt(8, crc)
        return arr
    }

    private fun wavHeaderBytes(): ByteArray =
        ByteArrayOutputStream()
            .apply {
                write("RIFF".toByteArray(StandardCharsets.US_ASCII))
                write(byteArrayOf(36, 0, 0, 0))
                write("WAVE".toByteArray(StandardCharsets.US_ASCII))
            }.toByteArray()

    private fun ftypBytes(brand: String): ByteArray =
        ByteArrayOutputStream()
            .apply {
                write(byteArrayOf(0, 0, 0, 16))
                write("ftyp".toByteArray(StandardCharsets.US_ASCII))
                write(brand.toByteArray(StandardCharsets.US_ASCII))
                write(byteArrayOf(0, 0, 0, 0))
            }.toByteArray()

    private fun atomBytes(
        fourCc: String,
        size: Int,
    ): ByteArray =
        ByteBuffer
            .allocate(size)
            .order(ByteOrder.BIG_ENDIAN)
            .putInt(size)
            .put(fourCc.toByteArray(StandardCharsets.US_ASCII))
            .array()

    private fun rasterBytes(
        format: String,
        width: Int,
        height: Int,
        hasAlpha: Boolean = false,
    ): ByteArray {
        val type = if (hasAlpha) BufferedImage.TYPE_INT_ARGB else BufferedImage.TYPE_INT_RGB
        val image = BufferedImage(width, height, type)
        val g = image.createGraphics()
        g.color = Color.BLUE
        g.fillRect(0, 0, width, height)
        g.dispose()
        val out = ByteArrayOutputStream()
        check(ImageIO.write(image, format, out))
        return out.toByteArray()
    }

    private fun validAvifBytes(
        width: Int,
        height: Int,
    ): ByteArray {
        val ispe =
            ByteBuffer
                .allocate(20)
                .putInt(20)
                .put("ispe".toByteArray(StandardCharsets.US_ASCII))
                .putInt(0)
                .putInt(width)
                .putInt(height)
                .array()
        val ipco =
            ByteBuffer
                .allocate(8 + ispe.size)
                .putInt(8 + ispe.size)
                .put("ipco".toByteArray())
                .put(ispe)
                .array()
        val iprp =
            ByteBuffer
                .allocate(8 + ipco.size)
                .putInt(8 + ipco.size)
                .put("iprp".toByteArray())
                .put(ipco)
                .array()
        val meta =
            ByteBuffer
                .allocate(12 + iprp.size)
                .putInt(12 + iprp.size)
                .put("meta".toByteArray())
                .putInt(0)
                .put(iprp)
                .array()
        val ftyp = ftypBytes("avif")
        return ftyp + meta
    }

    private fun validIcoBytes(
        width: Int,
        height: Int,
    ): ByteArray {
        val payload = ByteArray(16)
        val buf = ByteBuffer.allocate(6 + 16 + payload.size).order(ByteOrder.LITTLE_ENDIAN)
        buf.putShort(0)
        buf.putShort(1)
        buf.putShort(1)
        buf.put(width.toByte())
        buf.put(height.toByte())
        buf.put(0)
        buf.put(0)
        buf.putShort(1)
        buf.putShort(32)
        buf.putInt(payload.size)
        buf.putInt(22)
        buf.put(payload)
        return buf.array()
    }

    private data class TarTestEntry(
        val name: String,
        val payload: ByteArray,
        val prefix: String = "",
    )

    private fun tarHeaderBlock(
        name: String,
        entrySize: Long,
        prefix: String = "",
    ): ByteArray {
        val block = ByteArray(512)
        name.toByteArray(StandardCharsets.UTF_8).copyInto(block, 0)
        "0000644\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 100)
        "0000000\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 108)
        "0000000\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 116)
        entrySize
            .toString(8)
            .padStart(11, '0')
            .toByteArray(StandardCharsets.US_ASCII)
            .copyInto(block, 124)
        "00000000000\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 136)
        for (i in 148..155) block[i] = ' '.code.toByte()
        block[156] = '0'.code.toByte()
        "ustar\u0000".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 257)
        "00".toByteArray(StandardCharsets.US_ASCII).copyInto(block, 263)
        if (prefix.isNotEmpty()) {
            prefix.toByteArray(StandardCharsets.UTF_8).copyInto(block, 345)
        }
        var sum = 0
        for (b in block) sum += b.toInt() and 0xFF
        sum
            .toString(8)
            .padStart(6, '0')
            .toByteArray(StandardCharsets.US_ASCII)
            .copyInto(block, 148)
        block[154] = 0
        block[155] = ' '.code.toByte()
        return block
    }

    private fun multiEntryTarBytes(vararg entries: TarTestEntry): ByteArray {
        val out = ByteArrayOutputStream()
        entries.forEach { entry ->
            out.write(tarHeaderBlock(entry.name, entry.payload.size.toLong(), entry.prefix))
            out.write(entry.payload)
            val paddedPayloadLen = ((entry.payload.size + 511) / 512) * 512
            if (paddedPayloadLen > entry.payload.size) {
                out.write(ByteArray(paddedPayloadLen - entry.payload.size))
            }
        }
        out.write(ByteArray(1024))
        return out.toByteArray()
    }

    private fun encryptedZipBytes(
        name: String,
        payload: ByteArray,
    ): ByteArray {
        val bytes = zipBytes(name to payload)
        bytes[6] = (bytes[6].toInt() or 0x01).toByte()
        val cdOffset = findZipCentralDirOffset(bytes)
        bytes[cdOffset + 8] = (bytes[cdOffset + 8].toInt() or 0x01).toByte()
        return bytes
    }

    private fun nonUtf8LocalEntryZipBytes(): ByteArray {
        val bytes = zipBytes("abcd.txt" to "hello")
        bytes[7] = (bytes[7].toInt() and 0xF7).toByte()
        bytes[30] = 0xFF.toByte()
        bytes[31] = 0xFE.toByte()
        bytes[32] = 0xFD.toByte()
        bytes[33] = 0xFC.toByte()
        return bytes
    }

    private fun findZipCentralDirOffset(bytes: ByteArray): Int {
        for (i in 0..(bytes.size - 4)) {
            if (
                bytes[i] == 0x50.toByte() &&
                bytes[i + 1] == 0x4B.toByte() &&
                bytes[i + 2] == 0x01.toByte() &&
                bytes[i + 3] == 0x02.toByte()
            ) {
                return i
            }
        }
        error("Central directory signature not found")
    }

    private fun avifWith64BitMetaBoxSize(boxSize: Long): ByteArray {
        val metaHeader =
            ByteBuffer
                .allocate(24)
                .putInt(1)
                .put("meta".toByteArray(StandardCharsets.US_ASCII))
                .putLong(boxSize)
                .putLong(0L)
                .array()
        return ftypBytes("avif") + metaHeader
    }

    private fun validAvifWith64BitMetaBox(
        width: Int,
        height: Int,
    ): ByteArray {
        val ispe =
            ByteBuffer
                .allocate(20)
                .putInt(20)
                .put("ispe".toByteArray(StandardCharsets.US_ASCII))
                .putInt(0)
                .putInt(width)
                .putInt(height)
                .array()
        val ipco =
            ByteBuffer
                .allocate(8 + ispe.size)
                .putInt(8 + ispe.size)
                .put("ipco".toByteArray())
                .put(ispe)
                .array()
        val iprp =
            ByteBuffer
                .allocate(8 + ipco.size)
                .putInt(8 + ipco.size)
                .put("iprp".toByteArray())
                .put(ipco)
                .array()
        val metaSize = 20L + iprp.size
        val meta =
            ByteBuffer
                .allocate(20 + iprp.size)
                .putInt(1)
                .put("meta".toByteArray())
                .putLong(metaSize)
                .putInt(0)
                .put(iprp)
                .array()
        return ftypBytes("avif") + meta
    }
}
