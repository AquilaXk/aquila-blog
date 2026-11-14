package com.back.global.util

import com.back.boundedContexts.cloud.application.service.metadataEncodedLength
import com.back.boundedContexts.cloud.application.service.normalizeFilename
import com.back.boundedContexts.cloud.application.service.takeMetadataEncodedBytes
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.application.service.PostHitSideEffectQueue
import com.back.boundedContexts.post.application.service.PostLikeReconciliationService
import com.back.boundedContexts.post.application.service.PostPublicCursorCodec
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.revalidate.CdnCachePurgeService
import com.back.global.security.config.RequestPathNormalizer
import com.back.global.storage.application.PostAttachmentRetentionService
import com.back.global.storage.application.UploadedFileRetentionProperties
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.config.CloudStorageProperties
import com.back.global.storage.domain.UploadedFile
import com.back.global.task.application.TaskFacade
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.util.Ut
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoMoreInteractions
import org.mockito.Mockito.`when`
import org.springframework.mock.web.MockHttpServletRequest
import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.HexFormat

class LowLevelOptimizationParityTest {
    @Test
    fun `Utf8ChunkDigest matches MessageDigest UTF-8 SHA-256 across BMP, Hangul, surrogate pairs, and unpaired surrogates`() {
        val hex = HexFormat.of()
        val samples =
            listOf(
                "",
                "hello-world",
                "한글 테스트 제목과 본문",
                "emoji \uD83D\uDE80 rocket \uD83C\uDF0A wave",
                "unpaired-high-\uD83D-mid-\uDE80-low",
                "a\u0080b\u07FFc\u0800d\uFFFFe",
                "긴 본문 청크 경계 검증 ".repeat(200),
            )
        for (sample in samples) {
            val expected = hex.formatHex(MessageDigest.getInstance("SHA-256").digest(sample.toByteArray(StandardCharsets.UTF_8)))
            assertThat(Utf8ChunkDigest.sha256Hex(sample)).isEqualTo(expected)
        }
    }

    @Test
    fun `WeakEtagDigestWriter isolates its buffer from nested sha256Hex and sibling writers on the same thread`() {
        val hex = HexFormat.of()
        val outer = Utf8ChunkDigest.newWeakEtagWriter()
        outer.appendAscii("feed|page=1|")

        val nestedPayload = "중첩 호출 버퍼 오염 검증 payload"
        val nestedSha = Utf8ChunkDigest.sha256Hex(nestedPayload)
        assertThat(nestedSha).isEqualTo(
            hex.formatHex(MessageDigest.getInstance("SHA-256").digest(nestedPayload.toByteArray(StandardCharsets.UTF_8))),
        )

        val sibling = Utf8ChunkDigest.newWeakEtagWriter()
        val siblingEtag =
            sibling
                .appendAscii("other|writer|seed")
                .finishWeakEtag()

        val outerEtag =
            outer
                .appendUtf8("kw=한글")
                .appendChar('|')
                .appendLong(42L)
                .finishWeakEtag()

        val expectedSiblingHash = MessageDigest.getInstance("SHA-256").digest("other|writer|seed".toByteArray(StandardCharsets.UTF_8))
        val expectedOuterHash = MessageDigest.getInstance("SHA-256").digest("feed|page=1|kw=한글|42".toByteArray(StandardCharsets.UTF_8))
        assertThat(siblingEtag).isEqualTo("W/\"${hex.formatHex(expectedSiblingHash, 0, 16)}\"")
        assertThat(outerEtag).isEqualTo("W/\"${hex.formatHex(expectedOuterHash, 0, 16)}\"")
    }

    @Test
    fun `CloudUploadSupport metadataEncodedLength and takeMetadataEncodedBytes match S3 percent-20 UTF-8 byte bounds`() {
        val allAscii = (0..127).map { it.toChar() }.joinToString("")
        val samples =
            listOf(
                "",
                allAscii,
                "simple-file_01.txt*",
                "공백 포함 파일 이름.png",
                "한글과 emoji \uD83D\uDE80 섞인 이름 (v2)!@#+~",
                "   ___---...***   ",
                "a".repeat(250) + "가".repeat(60) + "\uD83D\uDE00".repeat(20),
            )
        for (sample in samples) {
            val encodedBytes =
                URLEncoder
                    .encode(sample, StandardCharsets.UTF_8)
                    .replace("+", "%20")
                    .toByteArray(StandardCharsets.US_ASCII)
                    .size
            assertThat(metadataEncodedLength(sample)).isEqualTo(encodedBytes)

            for (budget in listOf(0, 1, 5, 11, 12, 30, 1024)) {
                val truncated = sample.takeMetadataEncodedBytes(budget)
                val truncatedEncodedBytes =
                    URLEncoder
                        .encode(truncated, StandardCharsets.UTF_8)
                        .replace("+", "%20")
                        .toByteArray(StandardCharsets.US_ASCII)
                        .size
                assertThat(truncatedEncodedBytes).isLessThanOrEqualTo(budget)
                assertThat(sample.startsWith(truncated)).isTrue()
            }
        }

        val normalizedSpacedHangul = normalizeFilename("가 ".repeat(100) + ".pdf", "cloud-file")
        val normalizedS3Bytes =
            URLEncoder
                .encode(normalizedSpacedHangul, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .toByteArray(StandardCharsets.US_ASCII)
                .size
        assertThat(normalizedS3Bytes).isLessThanOrEqualTo(1024)
        assertThat(normalizedSpacedHangul).endsWith(".pdf")
    }

    @Test
    fun `CdnCachePurgeService single-pass tag normalizer matches regex reference behavior including max-length hyphen edge`() {
        val service =
            CdnCachePurgeService(
                purgeEnabled = false,
                purgeUrl = "",
                purgeToken = "",
                connectTimeoutMs = 1_000,
                requestTimeoutMs = 1_000,
                coalesceWindowMs = 200,
                coalesceMaxTags = 64,
                objectMapper = ObjectMapper(),
            )
        val cases =
            listOf(
                "",
                "---***---",
                "  Post-Tag:Kotlin_2.0  ",
                "!!!ABC///DEF::ghi___jkl!!!",
                "a".repeat(63) + "-----",
                "a".repeat(63) + "---b",
                "a".repeat(64) + "---c",
                "\uD83D\uDE80TagName\uD83D\uDE80",
            )
        for (raw in cases) {
            val reference =
                raw
                    .trim()
                    .lowercase()
                    .replace(Regex("[^a-z0-9:_-]"), "-")
                    .replace(Regex("-+"), "-")
                    .trim('-')
                    .take(64)
            assertThat(service.normalizeCacheTagToken(raw)).isEqualTo(reference)
        }
    }

    @Test
    fun `RequestPathNormalizer clean fast-path caches per dispatch URI and invalidates on URI mutation`() {
        val request = MockHttpServletRequest("GET", "/post/api/v1/posts")
        assertThat(RequestPathNormalizer.normalize(request)).isEqualTo("/post/api/v1/posts")
        assertThat(RequestPathNormalizer.normalize(request)).isEqualTo("/post/api/v1/posts")

        request.requestURI = "/post/api/v1/posts/../actuator/health"
        assertThat(RequestPathNormalizer.normalize(request)).isEqualTo("/post/api/v1/actuator/health")

        val withContext = MockHttpServletRequest("GET", "/app/api/v1/posts").apply { contextPath = "/app" }
        assertThat(RequestPathNormalizer.normalize(withContext)).isEqualTo("/api/v1/posts")
        withContext.contextPath = "/other"
        assertThat(RequestPathNormalizer.normalize(withContext)).isEqualTo("/app/api/v1/posts")
    }

    @Test
    fun `PostPublicCursorCodec rejects extra colons, padded base64, invalid base64, whitespace padding tamper, and key expiry`() {
        val now = Instant.parse("2026-11-14T00:00:00Z")
        val codec =
            PostPublicCursorCodec(
                cursorSigningSecret = "0123456789abcdef0123456789abcdef",
                cursorSigningKeyVersion = "2",
                cursorPreviousSigningSecret = "fedcba9876543210fedcba9876543210",
                cursorPreviousSigningKeyVersion = "1",
                cursorPreviousExpiresAtEpochSeconds = (now.epochSecond + 3600).toString(),
                clock = Clock.fixed(now, ZoneOffset.UTC),
            )
        val valid = codec.encodeCursor(123L, 456L, PostSearchSortType1.CREATED_AT)
        val parsed = requireNotNull(codec.parseCursor("  $valid  ", PostSearchSortType1.CREATED_AT))
        assertThat(parsed.sortValue).isEqualTo(123L)
        assertThat(parsed.id).isEqualTo(456L)

        val parts = valid.split(":")
        val invalidVariants =
            listOf(
                "$valid:extra",
                parts.dropLast(1).joinToString(":"),
                "${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${parts[4]}:${parts[5]}=",
                "${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${parts[4]}:${parts[5].dropLast(1)}!",
                "${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}: ${parts[4]}:${parts[5]}",
                "99:${parts[1]}:${parts[2]}:${parts[3]}:${parts[4]}:${parts[5]}",
                "${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:HIT_COUNT:${parts[5]}",
            )
        for (bad in invalidVariants) {
            assertThatThrownBy { codec.parseCursor(bad, PostSearchSortType1.CREATED_AT) }
                .isInstanceOf(AppException::class.java)
        }
    }

    @Test
    fun `FeedPostDto and PostDto prefer trimmed non-blank post thumbnail and fall back when blank`() {
        Ut.JSON.objectMapper = jacksonObjectMapper()
        AppConfig(siteBackUrl = "https://api.example.com", siteFrontUrl = "https://example.com")
        val author =
            Member(
                id = 7L,
                username = "thumb-author",
                password = "Abcd1234!",
                nickname = "작성자",
                email = "thumb@example.com",
                apiKey = "thumb-key",
            ).apply {
                createdAt = Instant.EPOCH
                modifiedAt = Instant.EPOCH
                setProfileWorkspacePublishedContent(MemberProfileWorkspaceContent())
            }
        val body = "![extracted](https://cdn.example.com/extracted.webp)"

        val explicit =
            Post(id = 1L, author = author, title = "제목", content = body, published = true, listed = true).apply {
                createdAt = Instant.EPOCH
                modifiedAt = Instant.EPOCH
                thumbnail = "  https://cdn.example.com/explicit.webp  "
            }
        assertThat(FeedPostDto.from(explicit).thumbnail).isEqualTo("https://cdn.example.com/explicit.webp")
        assertThat(PostDto(explicit).thumbnail).isEqualTo("https://cdn.example.com/explicit.webp")

        val blankThumb =
            Post(id = 2L, author = author, title = "제목", content = body, published = true, listed = true).apply {
                createdAt = Instant.EPOCH
                modifiedAt = Instant.EPOCH
                thumbnail = "   "
            }
        assertThat(FeedPostDto.from(blankThumb).thumbnail).isEqualTo("https://cdn.example.com/extracted.webp")
        assertThat(PostDto(blankThumb).thumbnail).isEqualTo("https://cdn.example.com/extracted.webp")
    }

    @Test
    fun `PostAttachmentRetentionService preloads object keys in one batch query and saves once`() {
        val repository = mock(UploadedFileRepositoryPort::class.java)
        val f1 = UploadedFile(objectKey = "posts/k1.png", bucket = "b", contentType = "image/png", fileSize = 10L)
        val f2 = UploadedFile(objectKey = "posts/k2.png", bucket = "b", contentType = "image/png", fileSize = 20L)
        val f3 = UploadedFile(objectKey = "posts/old.png", bucket = "b", contentType = "image/png", fileSize = 30L)
        `when`(repository.findByObjectKeyIn(setOf("posts/k1.png", "posts/k2.png", "posts/old.png")))
            .thenReturn(listOf(f1, f2, f3))
        val service =
            PostAttachmentRetentionService(
                uploadedFileRepository = repository,
                storageProperties = CloudStorageProperties(bucket = "b"),
                retentionProperties = UploadedFileRetentionProperties(),
                clock = Clock.fixed(Instant.parse("2026-11-14T00:00:00Z"), ZoneOffset.UTC),
            )

        service.syncPostAttachmentKeys(
            postId = 55L,
            currentImageObjectKeys = listOf("posts/k1.png", "posts/k2.png"),
            previousImageObjectKeys = listOf("posts/old.png"),
            currentFileObjectKeys = emptyList(),
            previousFileObjectKeys = emptyList(),
        )

        verify(repository, times(1)).findByObjectKeyIn(setOf("posts/k1.png", "posts/k2.png", "posts/old.png"))
        verify(repository, times(1)).saveAllUploadedFiles(listOf(f1, f2, f3))
        verifyNoMoreInteractions(repository)
    }

    @Test
    fun `PostLikeReconciliationService reconciles N attrs using a single grouped countByPostIdIn query`() {
        val author =
            Member(
                id = 1L,
                username = "batch-like-author",
                password = "Abcd1234!",
                nickname = "작성자",
                email = "batch-like@example.com",
                apiKey = "batch-like-key",
            )
        val p1 = Post(id = 11L, author = author, title = "p1", content = "c1", published = true, listed = true)
        val p2 = Post(id = 12L, author = author, title = "p2", content = "c2", published = true, listed = true)
        val a1 = PostAttr(id = 101L, subject = p1, name = LIKES_COUNT, value = 1)
        val a2 = PostAttr(id = 102L, subject = p2, name = LIKES_COUNT, value = 0)
        val postAttrRepository = mock(PostAttrRepositoryPort::class.java)
        val postLikeRepository = mock(PostLikeRepositoryPort::class.java)
        val postRepository = mock(PostRepositoryPort::class.java)
        val queue = PostHitSideEffectQueue(mock(TaskFacade::class.java))
        `when`(
            postAttrRepository.findRecentlyModifiedByName(
                name = eqNonNull(LIKES_COUNT),
                modifiedAfter = anyNonNull(Instant.EPOCH),
                limit = eqNonNull(20),
            ),
        ).thenReturn(listOf(a1, a2))
        `when`(postLikeRepository.countByPostIdIn(setOf(11L, 12L))).thenReturn(mapOf(11L to 4L, 12L to 2L))

        val service = PostLikeReconciliationService(postAttrRepository, postLikeRepository, postRepository, queue)
        val corrected = service.reconcileRecentlyTouchedPosts(lookbackHours = 24, limit = 20)

        assertThat(corrected).isEqualTo(2)
        verify(postLikeRepository, times(1)).countByPostIdIn(setOf(11L, 12L))
        verify(postLikeRepository, never()).countByPost(p1)
        verify(postLikeRepository, never()).countByPost(p2)
    }

    private fun <T> eqNonNull(value: T): T {
        ArgumentMatchers.eq(value)
        return value
    }

    private fun <T> anyNonNull(fallback: T): T {
        ArgumentMatchers.any<T>()
        return fallback
    }
}
