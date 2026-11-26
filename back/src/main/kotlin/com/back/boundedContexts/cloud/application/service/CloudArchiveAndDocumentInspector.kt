package com.back.boundedContexts.cloud.application.service

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.application.ImageUploadAdmissionValidator
import java.io.BufferedInputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.CharBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.util.Locale
import java.util.zip.CRC32
import java.util.zip.GZIPInputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipInputStream

/**
 * Open-source reference evaluation:
 * 1) Apache Commons Compress (Apache-2.0): evaluated and omitted to avoid expanding runtime
 *    dependencies where JDK `java.util.zip` and compact header parsers enforce all bounds.
 * 2) Existing dependencies: JDK `java.util.zip` (`ZipInputStream`, `GZIPInputStream`, `CRC32`)
 *    and `StandardCharsets.UTF_8` strict `CharsetDecoder`.
 * 3) Clean-room fail-closed inspection: enforces entry count, nesting depth, uncompressed-byte
 *    and compression-ratio caps against zip/tar/gzip/7z bombs, static 128-byte ASCII control
 *    lookup table for UTF-8 text/code validation, and hardened SVG active-XSS screening.
 */
object CloudArchiveAndDocumentInspector {
    private const val STREAM_BUFFER_BYTES = 8_192
    private const val MAX_ARCHIVE_ENTRIES = 10_000
    private const val MAX_ARCHIVE_NESTING_DEPTH = 3
    private const val MAX_ARCHIVE_UNCOMPRESSED_BYTES = 512L * 1024 * 1024
    private const val MAX_COMPRESSION_RATIO = 100L
    private const val RATIO_ENFORCEMENT_THRESHOLD_BYTES = 16L * 1024 * 1024
    private const val ZIP_EOCD_MIN_BYTES = 22L
    private const val GZIP_RATIO_FLOOR_BYTES = 4L * 1024 * 1024
    private const val TAR_BLOCK_BYTES = 512
    private const val TAR_USTAR_OFFSET = 257
    private const val SEVEN_ZIP_HEADER_BYTES = 32
    private const val MAX_SVG_BYTES = 5L * 1024 * 1024

    private const val ZIP_LOCAL_HEADER_WORD = 0x504B_0304
    private const val ZIP_EOCD_WORD = 0x504B_0506
    private const val ZIP_SPANNED_WORD = 0x504B_0708
    private const val SEVEN_ZIP_MAGIC_PREFIX = 0x377A_BCAF
    private const val RIFF_WORD = 0x5249_4646
    private const val WAVE_WORD = 0x5741_5645
    private const val OGGS_WORD = 0x4F67_6753
    private const val FLAC_WORD = 0x664C_6143
    private const val FTYP_WORD = 0x6674_7970
    private const val ID3_PREFIX = 0x4944_33

    const val HWPX_CONTENT_TYPE = "application/haansofthwpx"
    const val ZIP_CONTENT_TYPE = "application/zip"
    const val DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    const val XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    const val PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    const val TAR_CONTENT_TYPE = "application/x-tar"
    const val GZIP_CONTENT_TYPE = "application/gzip"
    const val SEVEN_ZIP_CONTENT_TYPE = "application/x-7z-compressed"
    const val SVG_CONTENT_TYPE = "image/svg+xml"

    private const val HWPX_MANIFEST_ENTRY = "Contents/content.hpf"
    private val HWPX_DOCUMENT_ENTRIES =
        setOf(
            "Contents/header.xml",
            "Contents/section0.xml",
            "META-INF/container.xml",
        )

    private val TEXT_ASCII_ALLOWED =
        BooleanArray(128).apply {
            for (code in 0x20..0x7E) this[code] = true
            this['\t'.code] = true
            this['\n'.code] = true
            this['\r'.code] = true
            this[0x0C] = true // \f
        }

    private val SVG_ENTITY_HEX_OR_DEC = Regex("&#(?:x([0-9a-fA-F]{1,6})|([0-9]{1,7}));?")
    private val SVG_WHITESPACE = Regex("[\\u0000-\\u0020]+")
    private val SVG_ON_EVENT_ATTR = Regex("(?i)(?:^|[\\s/\"'`>])on[a-z]{1,24}\\s*=")

    val TEXT_EXTENSION_CONTENT_TYPES: Map<String, String> =
        mapOf(
            "txt" to "text/plain",
            "log" to "text/plain",
            "ini" to "text/plain",
            "conf" to "text/plain",
            "cfg" to "text/plain",
            "toml" to "text/plain",
            "env" to "text/plain",
            "md" to "text/markdown",
            "markdown" to "text/markdown",
            "mdx" to "text/markdown",
            "csv" to "text/csv",
            "tsv" to "text/csv",
            "json" to "application/json",
            "jsonl" to "application/json",
            "ndjson" to "application/json",
            "yaml" to "application/yaml",
            "yml" to "application/yaml",
            "xml" to "application/xml",
            "html" to "text/html",
            "htm" to "text/html",
            "css" to "text/css",
            "js" to "application/javascript",
            "mjs" to "application/javascript",
            "ts" to "text/plain",
            "tsx" to "text/plain",
            "jsx" to "text/plain",
            "kt" to "text/plain",
            "kts" to "text/plain",
            "java" to "text/plain",
            "py" to "text/plain",
            "go" to "text/plain",
            "rs" to "text/plain",
            "sh" to "text/plain",
            "sql" to "text/plain",
        )

    private val MP4_AUDIO_BRANDS =
        setOf(
            0x4D34_4120, // M4A
            0x4D34_4220, // M4B
            0x4D34_5020, // M4P
        )

    data class ZipInspectionState(
        var entryCount: Int = 0,
        var totalUncompressedBytes: Long = 0L,
    )

    fun isZipSignature(
        bytes: ByteArray,
        length: Int,
    ): Boolean {
        if (length < 4) return false
        val word = ImageUploadAdmissionValidator.readInt32BE(bytes, 0)
        return word == ZIP_LOCAL_HEADER_WORD || word == ZIP_EOCD_WORD || word == ZIP_SPANNED_WORD
    }

    fun inspectZipOrOffice(
        file: Path,
        extension: String,
    ): String? = inspectZipOrOffice(file, extension, MAX_ARCHIVE_ENTRIES, MAX_ARCHIVE_UNCOMPRESSED_BYTES)

    internal fun inspectZipOrOffice(
        file: Path,
        extension: String,
        maxEntries: Int,
        maxUncompressedBytes: Long,
    ): String? =
        inspectZipOrOffice(
            file = file,
            extension = extension,
            maxEntries = maxEntries,
            maxUncompressedBytes = maxUncompressedBytes,
            ratioThresholdBytes = RATIO_ENFORCEMENT_THRESHOLD_BYTES,
        )

    internal fun inspectZipOrOffice(
        file: Path,
        extension: String,
        maxEntries: Int,
        maxUncompressedBytes: Long,
        ratioThresholdBytes: Long,
    ): String? {
        val fileSize = Files.size(file)
        if (fileSize < ZIP_EOCD_MIN_BYTES) return null

        val centralDirectoryValid =
            try {
                ZipFile(file.toFile()).use { zip ->
                    val entries = zip.entries()
                    var count = 0
                    while (entries.hasMoreElements()) {
                        count += 1
                        if (count > maxEntries) {
                            throw AppException(ErrorCode.BAD_REQUEST, "ZIP 아카이브 엔트리 수가 허용 상한을 초과했습니다.")
                        }
                        val entry = entries.nextElement()
                        validateSafeArchiveEntryName(entry.name)
                        if (entry.size > maxUncompressedBytes) {
                            throw AppException(ErrorCode.BAD_REQUEST, "압축 해제 크기가 허용 상한을 초과했습니다.")
                        }
                    }
                    true
                }
            } catch (ex: AppException) {
                throw ex
            } catch (_: Exception) {
                false
            }
        if (!centralDirectoryValid) return null

        val state = ZipInspectionState()
        val entryNames = LinkedHashSet<String>()
        BufferedInputStream(Files.newInputStream(file), STREAM_BUFFER_BYTES).use { stream ->
            inspectZipStream(
                input = stream,
                compressedBudgetBytes = fileSize,
                depth = 0,
                state = state,
                collectedNames = entryNames,
                maxEntries = maxEntries,
                maxUncompressedBytes = maxUncompressedBytes,
                ratioThresholdBytes = ratioThresholdBytes,
            )
        }

        return when (extension) {
            "hwpx" ->
                if (HWPX_MANIFEST_ENTRY in entryNames && entryNames.any { it in HWPX_DOCUMENT_ENTRIES }) {
                    HWPX_CONTENT_TYPE
                } else {
                    null
                }
            "docx" -> classifyOfficeArchive(entryNames, "word/", DOCX_CONTENT_TYPE)
            "xlsx" -> classifyOfficeArchive(entryNames, "xl/", XLSX_CONTENT_TYPE)
            "pptx" -> classifyOfficeArchive(entryNames, "ppt/", PPTX_CONTENT_TYPE)
            else -> if (extension == "zip") ZIP_CONTENT_TYPE else null
        }
    }

    private fun classifyOfficeArchive(
        entries: Set<String>,
        requiredPrefix: String,
        targetMime: String,
    ): String? =
        if ("[Content_Types].xml" in entries && entries.any { it.startsWith(requiredPrefix) }) {
            targetMime
        } else {
            null
        }

    private fun inspectZipStream(
        input: InputStream,
        compressedBudgetBytes: Long,
        depth: Int,
        state: ZipInspectionState,
        collectedNames: MutableSet<String>?,
        maxEntries: Int,
        maxUncompressedBytes: Long,
        ratioThresholdBytes: Long,
    ) {
        if (depth > MAX_ARCHIVE_NESTING_DEPTH) {
            throw AppException(ErrorCode.BAD_REQUEST, "압축 파일 중첩 깊이가 허용 상한을 초과했습니다.")
        }
        val scratch = ByteArray(STREAM_BUFFER_BYTES)
        val zip = ZipInputStream(input, StandardCharsets.UTF_8)
        var levelUncompressedBytes = 0L
        while (true) {
            val entry = zip.nextEntry ?: break
            state.entryCount += 1
            if (state.entryCount > maxEntries) {
                throw AppException(ErrorCode.BAD_REQUEST, "ZIP 아카이브 엔트리 수가 허용 상한을 초과했습니다.")
            }
            val normalizedName = validateSafeArchiveEntryName(entry.name)
            collectedNames?.add(normalizedName)
            levelUncompressedBytes =
                inspectZipEntryBytes(
                    zip = zip,
                    entry = entry,
                    scratch = scratch,
                    compressedBudgetBytes = compressedBudgetBytes,
                    initialLevelUncompressedBytes = levelUncompressedBytes,
                    depth = depth,
                    state = state,
                    maxEntries = maxEntries,
                    maxUncompressedBytes = maxUncompressedBytes,
                    ratioThresholdBytes = ratioThresholdBytes,
                )
            zip.closeEntry()
        }
    }

    private fun inspectZipEntryBytes(
        zip: ZipInputStream,
        entry: ZipEntry,
        scratch: ByteArray,
        compressedBudgetBytes: Long,
        initialLevelUncompressedBytes: Long,
        depth: Int,
        state: ZipInspectionState,
        maxEntries: Int,
        maxUncompressedBytes: Long,
        ratioThresholdBytes: Long,
    ): Long {
        val nestedExt = extractLowerExt(entry.name)
        val shouldInspectNested = !entry.isDirectory && nestedExt in setOf("zip", "hwpx", "docx", "xlsx", "pptx")
        val nestedBuffer = if (shouldInspectNested) java.io.ByteArrayOutputStream() else null
        var nestedOverflowed = false
        var levelUncompressedBytes = initialLevelUncompressedBytes

        while (true) {
            val read = zip.read(scratch)
            if (read < 0) break
            state.totalUncompressedBytes += read
            levelUncompressedBytes += read
            if (state.totalUncompressedBytes > maxUncompressedBytes) {
                throw AppException(ErrorCode.BAD_REQUEST, "압축 해제 크기가 허용 상한을 초과했습니다.")
            }
            if (
                levelUncompressedBytes > ratioThresholdBytes &&
                compressedBudgetBytes > 0L &&
                levelUncompressedBytes > compressedBudgetBytes * MAX_COMPRESSION_RATIO
            ) {
                throw AppException(ErrorCode.BAD_REQUEST, "압축 비율이 안전 상한을 초과했습니다.")
            }
            if (nestedBuffer != null) {
                val remaining = (ratioThresholdBytes - nestedBuffer.size().toLong()).coerceAtLeast(0L)
                val toWrite = minOf(read.toLong(), remaining).toInt()
                if (toWrite > 0) {
                    nestedBuffer.write(scratch, 0, toWrite)
                }
                if (toWrite < read) {
                    nestedOverflowed = true
                }
            }
        }
        if (nestedBuffer != null && nestedBuffer.size() > 0) {
            val nestedBytes = nestedBuffer.toByteArray()
            if (isZipSignature(nestedBytes, nestedBytes.size)) {
                if (nestedOverflowed) {
                    throw AppException(ErrorCode.BAD_REQUEST, "중첩 아카이브 크기가 허용 검사 상한을 초과했습니다.")
                }
                inspectZipStream(
                    input = nestedBytes.inputStream(),
                    compressedBudgetBytes = nestedBytes.size.toLong(),
                    depth = depth + 1,
                    state = state,
                    collectedNames = null,
                    maxEntries = maxEntries,
                    maxUncompressedBytes = maxUncompressedBytes,
                    ratioThresholdBytes = ratioThresholdBytes,
                )
            }
        }
        return levelUncompressedBytes
    }

    internal fun validateSafeArchiveEntryName(rawName: String): String {
        if (rawName.indexOf('\u0000') >= 0) {
            throw AppException(ErrorCode.BAD_REQUEST, "유효하지 않은 아카이브 엔트리 경로입니다.")
        }
        val normalized = rawName.replace('\\', '/')
        if (normalized.startsWith("/")) {
            throw AppException(ErrorCode.BAD_REQUEST, "유효하지 않은 아카이브 엔트리 경로입니다.")
        }
        for (segment in normalized.split('/')) {
            if (segment == "..") {
                throw AppException(ErrorCode.BAD_REQUEST, "유효하지 않은 아카이브 엔트리 경로입니다.")
            }
        }
        return normalized
    }

    fun inspectTar(file: Path): Boolean = inspectTar(file, MAX_ARCHIVE_ENTRIES)

    internal fun inspectTar(
        file: Path,
        maxEntries: Int,
    ): Boolean {
        val fileSize = Files.size(file)
        if (fileSize < TAR_BLOCK_BYTES || fileSize % TAR_BLOCK_BYTES != 0L) return false
        return BufferedInputStream(Files.newInputStream(file), STREAM_BUFFER_BYTES).use { stream ->
            inspectTarStream(stream, maxEntries)
        }
    }

    private fun inspectTarStream(
        input: InputStream,
        maxEntries: Int,
    ): Boolean {
        val block = ByteArray(TAR_BLOCK_BYTES)
        var entries = 0
        var totalPayload = 0L
        var sawHeader = false

        while (true) {
            val read = readFullBlock(input, block)
            if (read == 0) return sawHeader
            if (read != TAR_BLOCK_BYTES) return false
            if (block.all { it == 0.toByte() }) return sawHeader

            if (!hasUstarMagic(block) || !verifyTarChecksum(block)) return false
            sawHeader = true
            entries += 1
            if (entries > maxEntries) {
                throw AppException(ErrorCode.BAD_REQUEST, "TAR 아카이브 엔트리 수가 허용 상한을 초과했습니다.")
            }
            val rawName = extractNullTerminatedAscii(block, 0, 100)
            validateSafeArchiveEntryName(rawName)
            val entrySize = parseTarOctal(block, 124, 12) ?: return false
            totalPayload += entrySize
            if (totalPayload > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
                throw AppException(ErrorCode.BAD_REQUEST, "TAR 아카이브 크기가 허용 상한을 초과했습니다.")
            }
            val paddedBlocks = (entrySize + TAR_BLOCK_BYTES - 1L) / TAR_BLOCK_BYTES
            ImageUploadAdmissionValidator.skipExact(input, paddedBlocks * TAR_BLOCK_BYTES)
        }
    }

    fun inspectGzip(
        file: Path,
        extension: String,
    ): Boolean = inspectGzip(file, extension, MAX_ARCHIVE_UNCOMPRESSED_BYTES)

    internal fun inspectGzip(
        file: Path,
        extension: String,
        maxDecompressedBytes: Long,
    ): Boolean {
        val fileSize = Files.size(file)
        if (fileSize < 10L) return false
        return BufferedInputStream(Files.newInputStream(file), STREAM_BUFFER_BYTES).use { raw ->
            val counting = CountingInputStream(raw)
            val headerProbe = ByteArray(TAR_BLOCK_BYTES)
            var probeFilled = 0
            val gzip =
                try {
                    GZIPInputStream(counting, STREAM_BUFFER_BYTES)
                } catch (_: Exception) {
                    return@use false
                }
            val buffer = ByteArray(STREAM_BUFFER_BYTES)
            var totalDecompressed = 0L
            try {
                while (true) {
                    val read = gzip.read(buffer)
                    if (read < 0) break
                    if (probeFilled < headerProbe.size) {
                        val copyLen = minOf(read, headerProbe.size - probeFilled)
                        System.arraycopy(buffer, 0, headerProbe, probeFilled, copyLen)
                        probeFilled += copyLen
                    }
                    totalDecompressed += read
                    if (totalDecompressed > maxDecompressedBytes) {
                        throw AppException(ErrorCode.BAD_REQUEST, "GZIP 압축 해제 크기가 허용 상한을 초과했습니다.")
                    }
                    val compressedSoFar = maxOf(counting.bytesRead, 1L)
                    if (
                        totalDecompressed > GZIP_RATIO_FLOOR_BYTES &&
                        totalDecompressed > compressedSoFar * MAX_COMPRESSION_RATIO
                    ) {
                        throw AppException(ErrorCode.BAD_REQUEST, "GZIP 압축 비율이 안전 상한을 초과했습니다.")
                    }
                }
            } catch (ex: AppException) {
                throw ex
            } catch (_: Exception) {
                return@use false
            }

            if ((extension == "tgz" || extension == "gz") && probeFilled == TAR_BLOCK_BYTES && hasUstarMagic(headerProbe)) {
                return@use verifyTarChecksum(headerProbe)
            }
            true
        }
    }

    fun inspect7z(
        file: Path,
        header: ByteArray,
        headerLen: Int,
    ): Boolean {
        if (headerLen < SEVEN_ZIP_HEADER_BYTES) return false
        if (
            ImageUploadAdmissionValidator.readInt32BE(header, 0) != SEVEN_ZIP_MAGIC_PREFIX ||
            (header[4].toInt() and 0xFF) != 0x27 ||
            (header[5].toInt() and 0xFF) != 0x1C
        ) {
            return false
        }
        val expectedCrc = ImageUploadAdmissionValidator.readUint32LE(header, 8)
        val crc = CRC32().apply { update(header, 12, 20) }.value
        if (crc != expectedCrc) return false

        val nextOffset = readInt64LE(header, 12)
        val nextSize = readInt64LE(header, 20)
        val fileSize = Files.size(file)
        if (nextOffset < 0L || nextSize < 0L) return false
        val endOffset = SEVEN_ZIP_HEADER_BYTES.toLong() + nextOffset
        if (endOffset < 0L || endOffset + nextSize < 0L || endOffset + nextSize > fileSize) return false
        return true
    }

    fun detectAudioFromSignature(
        header: ByteArray,
        headerLen: Int,
        declaredContentType: String?,
        extension: String,
    ): String? {
        if (
            headerLen >= 12 &&
            ImageUploadAdmissionValidator.readInt32BE(header, 0) == RIFF_WORD &&
            ImageUploadAdmissionValidator.readInt32BE(header, 8) == WAVE_WORD
        ) {
            return "audio/wav"
        }
        if (headerLen >= 4 && ImageUploadAdmissionValidator.readInt32BE(header, 0) == FLAC_WORD) {
            return "audio/flac"
        }
        if (headerLen >= 4 && ImageUploadAdmissionValidator.readInt32BE(header, 0) == OGGS_WORD) {
            val isOpusHeader =
                headerLen >= 36 &&
                    String(header, 28, 8, StandardCharsets.US_ASCII) == "OpusHead"
            if (isOpusHeader && (extension == "opus" || declaredContentType == "audio/opus")) {
                return "audio/opus"
            }
            return if (extension == "opus") "audio/opus" else "audio/ogg"
        }
        if (headerLen >= 12 && ImageUploadAdmissionValidator.readInt32BE(header, 4) == FTYP_WORD) {
            val brand = ImageUploadAdmissionValidator.readInt32BE(header, 8)
            if (brand in MP4_AUDIO_BRANDS || (extension == "m4a" && declaredContentType != "video/mp4")) {
                return "audio/mp4"
            }
        }
        if (headerLen >= 3) {
            val id3Prefix =
                ((header[0].toInt() and 0xFF) shl 16) or
                    ((header[1].toInt() and 0xFF) shl 8) or
                    (header[2].toInt() and 0xFF)
            if (id3Prefix == ID3_PREFIX) {
                return "audio/mpeg"
            }
        }
        if (isAdtsAacFrame(header, headerLen) && (extension == "aac" || declaredContentType == "audio/aac")) {
            return "audio/aac"
        }
        if (isMpegAudioFrameSync(header, headerLen) && (extension == "mp3" || declaredContentType == "audio/mpeg")) {
            return "audio/mpeg"
        }
        return null
    }

    fun validateSafeSvg(file: Path): Boolean {
        val fileSize = Files.size(file)
        if (fileSize <= 0L || fileSize > MAX_SVG_BYTES) return false
        val bytes = Files.readAllBytes(file)
        if (bytes.any { it == 0.toByte() }) return false
        val raw =
            StandardCharsets.UTF_8
                .newDecoder()
                .onMalformedInput(CodingErrorAction.REPLACE)
                .onUnmappableCharacter(CodingErrorAction.REPLACE)
                .decode(ByteBuffer.wrap(bytes))
                .toString()
        if (raw.contains('\uFFFD') || !raw.contains("<svg", ignoreCase = true)) return false
        val decoded = decodeSvgEntities(raw)
        val lowered = decoded.lowercase(Locale.ROOT)
        if (
            lowered.contains("<!doctype") ||
            lowered.contains("<!entity") ||
            lowered.contains("<script") ||
            lowered.contains("<foreignobject")
        ) {
            return false
        }
        if (SVG_ON_EVENT_ATTR.containsMatchIn(decoded)) return false
        val collapsed = SVG_WHITESPACE.replace(lowered, "")
        if (
            collapsed.contains("javascript:") ||
            collapsed.contains("vbscript:") ||
            collapsed.contains("data:text/html") ||
            collapsed.contains("data:image/svg+xml")
        ) {
            return false
        }
        return true
    }

    fun inspectUtf8TextFile(
        file: Path,
        declaredContentType: String?,
        extension: String,
    ): String? {
        val targetMime = resolveTextMime(declaredContentType, extension) ?: return null
        val decoder =
            StandardCharsets.UTF_8
                .newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
        val allowEscapeChar = extension == "log"
        val byteBuf = ByteArray(STREAM_BUFFER_BYTES)
        val charBuf = CharBuffer.allocate(STREAM_BUFFER_BYTES)

        BufferedInputStream(Files.newInputStream(file), STREAM_BUFFER_BYTES).use { stream ->
            var leftOver = 0
            while (true) {
                val read = stream.read(byteBuf, leftOver, byteBuf.size - leftOver)
                val endOfStream = read < 0
                val available = if (endOfStream) leftOver else leftOver + read
                val inputBuffer = ByteBuffer.wrap(byteBuf, 0, available)
                charBuf.clear()
                val result = decoder.decode(inputBuffer, charBuf, endOfStream)
                if (result.isError) return null
                charBuf.flip()
                if (!areTextCharsAllowed(charBuf, allowEscapeChar)) return null
                if (endOfStream) break
                val remaining = inputBuffer.remaining()
                if (remaining > 0) {
                    System.arraycopy(byteBuf, inputBuffer.position(), byteBuf, 0, remaining)
                }
                leftOver = remaining
            }
        }
        return targetMime
    }

    private fun areTextCharsAllowed(
        chars: CharBuffer,
        allowEscapeChar: Boolean,
    ): Boolean {
        for (i in 0 until chars.length) {
            val ch = chars.get(i)
            val code = ch.code
            if (code == 0) return false
            if (code < 128) {
                if (!TEXT_ASCII_ALLOWED[code] && !(allowEscapeChar && code == 0x1B)) {
                    return false
                }
            } else if (Character.getType(ch) == Character.CONTROL.toInt()) {
                return false
            }
        }
        return true
    }

    private fun resolveTextMime(
        declaredContentType: String?,
        extension: String,
    ): String? {
        TEXT_EXTENSION_CONTENT_TYPES[extension]?.let { return it }
        return when (declaredContentType) {
            "text/plain",
            "text/markdown",
            "text/csv",
            "text/html",
            "text/xml",
            "application/xml",
            "application/json",
            "application/yaml",
            "text/css",
            "application/javascript",
            -> declaredContentType
            else -> null
        }
    }

    private fun decodeSvgEntities(raw: String): String {
        var current = raw
        repeat(2) {
            val replaced =
                SVG_ENTITY_HEX_OR_DEC.replace(current) { match ->
                    val code =
                        match.groupValues[1].takeIf { it.isNotEmpty() }?.toInt(16)
                            ?: match.groupValues[2].toInt(10)
                    if (code <= 0 || code > 0x10FFFF) "" else String(Character.toChars(code))
                }
            if (replaced == current) return replaced
            current = replaced
        }
        return current
    }

    private fun isAdtsAacFrame(
        header: ByteArray,
        headerLen: Int,
    ): Boolean {
        if (headerLen < 4) return false
        val b0 = header[0].toInt() and 0xFF
        val b1 = header[1].toInt() and 0xFF
        if (b0 != 0xFF || (b1 and 0xF6) != 0xF0) return false
        val b2 = header[2].toInt() and 0xFF
        val sampleRateIdx = (b2 ushr 2) and 0x0F
        return sampleRateIdx < 13
    }

    private fun isMpegAudioFrameSync(
        header: ByteArray,
        headerLen: Int,
    ): Boolean {
        if (headerLen < 4) return false
        val b0 = header[0].toInt() and 0xFF
        val b1 = header[1].toInt() and 0xFF
        if (b0 != 0xFF || (b1 and 0xE0) != 0xE0) return false
        val versionBits = (b1 ushr 3) and 0x03
        val layerBits = (b1 ushr 1) and 0x03
        val b2 = header[2].toInt() and 0xFF
        val bitrateIndex = (b2 ushr 4) and 0x0F
        val sampleRateIndex = (b2 ushr 2) and 0x03
        return versionBits != 0x01 && layerBits != 0x00 && bitrateIndex != 0x0F && sampleRateIndex != 0x03
    }

    private fun hasUstarMagic(block: ByteArray): Boolean =
        block[TAR_USTAR_OFFSET] == 'u'.code.toByte() &&
            block[TAR_USTAR_OFFSET + 1] == 's'.code.toByte() &&
            block[TAR_USTAR_OFFSET + 2] == 't'.code.toByte() &&
            block[TAR_USTAR_OFFSET + 3] == 'a'.code.toByte() &&
            block[TAR_USTAR_OFFSET + 4] == 'r'.code.toByte()

    private fun verifyTarChecksum(block: ByteArray): Boolean {
        val expected = parseTarOctal(block, 148, 8) ?: return false
        var unsignedSum = 0L
        for (i in 0 until TAR_BLOCK_BYTES) {
            unsignedSum += if (i in 148..155) 32L else (block[i].toInt() and 0xFF).toLong()
        }
        return unsignedSum == expected
    }

    private fun parseTarOctal(
        block: ByteArray,
        offset: Int,
        length: Int,
    ): Long? {
        var value = 0L
        var sawDigit = false
        for (i in offset until (offset + length)) {
            val b = block[i].toInt() and 0xFF
            if (b == 0 || b == ' '.code) {
                if (sawDigit) break
                continue
            }
            if (b !in '0'.code..'7'.code) return null
            sawDigit = true
            value = (value shl 3) or (b - '0'.code).toLong()
        }
        return if (sawDigit) value else 0L
    }

    private fun extractNullTerminatedAscii(
        block: ByteArray,
        offset: Int,
        length: Int,
    ): String {
        var end = offset
        while (end < offset + length && block[end] != 0.toByte()) {
            end += 1
        }
        return String(block, offset, end - offset, StandardCharsets.UTF_8)
    }

    private fun readFullBlock(
        input: InputStream,
        buffer: ByteArray,
    ): Int {
        var total = 0
        while (total < buffer.size) {
            val read = input.read(buffer, total, buffer.size - total)
            if (read < 0) break
            total += read
        }
        return total
    }

    private fun readInt64LE(
        bytes: ByteArray,
        offset: Int,
    ): Long {
        var result = 0L
        for (i in 0 until 8) {
            result = result or ((bytes[offset + i].toLong() and 0xFFL) shl (i * 8))
        }
        return result
    }

    private fun extractLowerExt(filename: String): String {
        val idx = filename.lastIndexOf('.')
        if (idx < 0 || idx == filename.lastIndex) return ""
        return filename.substring(idx + 1).lowercase(Locale.ROOT)
    }

    private class CountingInputStream(
        private val delegate: InputStream,
    ) : InputStream() {
        var bytesRead: Long = 0L
            private set

        override fun read(): Int {
            val value = delegate.read()
            if (value >= 0) bytesRead += 1L
            return value
        }

        override fun read(
            b: ByteArray,
            off: Int,
            len: Int,
        ): Int {
            val count = delegate.read(b, off, len)
            if (count > 0) bytesRead += count.toLong()
            return count
        }
    }
}
