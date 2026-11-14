package com.back.boundedContexts.post.dto

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@DisplayName("PostMetaExtractor 테스트")
class PostMetaExtractorTest {
    @BeforeEach
    fun clearCache() {
        PostMetaExtractor.clearCache()
    }

    @Test
    fun `front matter 에서 tags 와 categories 를 추출하고 동일 헤더 재요청 시 캐시를 재사용한다`() {
        val content =
            """
            ---
            title: 제목
            invalid-line-without-colon
            tag: '단일태그'
            tags: [성능, "피드", '']
            categories: [백엔드]
            ---

            본문 A
            """.trimIndent()
        val sameHeaderDifferentBody =
            """
            ---
            title: 제목
            invalid-line-without-colon
            tag: '단일태그'
            tags: [성능, "피드", '']
            categories: [백엔드]
            ---

            본문 B
            """.trimIndent()

        val first = PostMetaExtractor.extract(content)
        val second = PostMetaExtractor.extract(sameHeaderDifferentBody)

        assertThat(first.tags).containsExactly("단일태그", "성능", "피드")
        assertThat(first.categories).containsExactly("백엔드")
        assertThat(second).isSameAs(first)
        assertThat(PostMetaExtractor.cachedEntryCount()).isEqualTo(1)
    }

    @Test
    fun `본문 상단 메타 라인에서도 tags 와 categories 를 추출한다`() {
        val content =
            """
            tags: 성능, 피드
            category: 백엔드

            본문
            """.trimIndent()

        val meta = PostMetaExtractor.extract(content)
        val singleLineMeta = PostMetaExtractor.extract("category: 단독카테고리")

        assertThat(meta.tags).containsExactly("성능", "피드")
        assertThat(meta.categories).containsExactly("백엔드")
        assertThat(singleLineMeta.categories).containsExactly("단독카테고리")
    }

    @Test
    fun `16-stripe LRU 캐시는 엔트리를 분산 저장하고 스트라이프별 상한을 유지한다`() {
        assertThat(PostMetaExtractor.stripeCount()).isEqualTo(16)

        repeat(640) { idx ->
            val doc =
                """
                ---
                tags: [tag$idx, common]
                categories: [cat${idx % 4}]
                ---

                body $idx
                """.trimIndent()
            val meta = PostMetaExtractor.extract(doc)
            assertThat(meta.tags).containsExactly("tag$idx", "common")
        }

        val stripeCounts = PostMetaExtractor.stripeEntryCounts().toList()
        assertThat(stripeCounts).hasSize(16)
        assertThat(stripeCounts.count { it > 0 }).isGreaterThan(8)
        assertThat(stripeCounts).allSatisfy { count ->
            assertThat(count).isLessThanOrEqualTo(PostMetaExtractor.MAX_CACHE_ENTRIES / 16)
        }
        assertThat(PostMetaExtractor.cachedEntryCount()).isLessThanOrEqualTo(PostMetaExtractor.MAX_CACHE_ENTRIES)
    }

    @Test
    fun `동일 길이와 동일 32비트 hashCode 를 가진 서로 다른 front matter 도 충돌 없이 각각의 메타를 반환한다`() {
        val firstContent =
            """
            ---
            tags: ["Aa"]
            categories: ["CatAa"]
            ---

            본문
            """.trimIndent()
        val secondContent =
            """
            ---
            tags: ["BB"]
            categories: ["CatBB"]
            ---

            본문
            """.trimIndent()

        assertThat(firstContent.length).isEqualTo(secondContent.length)
        assertThat(firstContent.hashCode()).isEqualTo(secondContent.hashCode())

        val firstMeta = PostMetaExtractor.extract(firstContent)
        val secondMeta = PostMetaExtractor.extract(secondContent)

        assertThat(firstMeta.tags).containsExactly("Aa")
        assertThat(firstMeta.categories).containsExactly("CatAa")
        assertThat(secondMeta.tags).containsExactly("BB")
        assertThat(secondMeta.categories).containsExactly("CatBB")
    }

    @Test
    fun `front matter 나 상단 메타 라인이 없는 본문은 캐시를 오염시키지 않고 빈 메타를 반환한다`() {
        val plainContent = "# 제목\n\n메타데이터가 없는 일반 마크다운 본문입니다."
        val unclosedFrontmatter = "---\n닫히지 않은 프론트매터 본문"

        val plainMeta = PostMetaExtractor.extract(plainContent)
        val unclosedMeta = PostMetaExtractor.extract(unclosedFrontmatter)
        val blankMeta = PostMetaExtractor.extract("   ")

        assertThat(plainMeta.tags).isEmpty()
        assertThat(plainMeta.categories).isEmpty()
        assertThat(unclosedMeta).isEqualTo(plainMeta)
        assertThat(blankMeta).isEqualTo(plainMeta)
        assertThat(PostMetaExtractor.cachedEntryCount()).isZero()
    }

    @Test
    fun `캐시 엔트리 수가 MAX_CACHE_ENTRIES 를 초과하면 상한을 유지하며 정상 동작한다`() {
        val total = PostMetaExtractor.MAX_CACHE_ENTRIES + 16
        for (index in 1..total) {
            val content =
                """
                ---
                tags: [tag-$index]
                categories: [cat-$index]
                ---

                본문 $index
                """.trimIndent()
            val meta = PostMetaExtractor.extract(content)
            assertThat(meta.tags).containsExactly("tag-$index")
            assertThat(meta.categories).containsExactly("cat-$index")
        }

        assertThat(PostMetaExtractor.cachedEntryCount()).isLessThanOrEqualTo(PostMetaExtractor.MAX_CACHE_ENTRIES)
    }

    @Test
    fun `캐시 키는 원문 문자열이 아닌 64자리 SHA-256 다이제스트를 사용하고 동시 미스 폭주 후에도 상한을 초과하지 않는다`() {
        val sampleBlock = "tags: [kotlin]\ncategories: [backend]"
        val key = PostMetaExtractor.cacheKeyFor(sampleBlock)

        assertThat(key).hasSize(64)
        assertThat(key).matches("^[0-9a-f]{64}$")
        assertThat(key).isNotEqualTo(sampleBlock)

        for (index in 1..PostMetaExtractor.MAX_CACHE_ENTRIES) {
            PostMetaExtractor.extract("tags: [warm-$index]\n\n본문")
        }
        assertThat(PostMetaExtractor.cachedEntryCount())
            .isBetween(PostMetaExtractor.MAX_CACHE_ENTRIES / 2, PostMetaExtractor.MAX_CACHE_ENTRIES)

        val burstThreads = 16
        val startLatch = CountDownLatch(1)
        val doneLatch = CountDownLatch(burstThreads)
        val pool = Executors.newFixedThreadPool(burstThreads)
        try {
            for (threadIndex in 1..burstThreads) {
                pool.submit {
                    try {
                        startLatch.await()
                        PostMetaExtractor.extract("tags: [burst-$threadIndex]\n\n본문")
                    } finally {
                        doneLatch.countDown()
                    }
                }
            }
            startLatch.countDown()
            assertThat(doneLatch.await(5, TimeUnit.SECONDS)).isTrue()
        } finally {
            pool.shutdownNow()
        }

        PostMetaExtractor.extract("tags: [after-burst]\n\n본문")
        assertThat(PostMetaExtractor.cachedEntryCount()).isLessThanOrEqualTo(PostMetaExtractor.MAX_CACHE_ENTRIES)
    }

    @Test
    fun `CRLF 개행으로 시작하는 front matter 에서도 메타데이터와 썸네일을 정상 추출한다`() {
        val crlfContent =
            "---\r\n" +
                "tags: [crlf-tag, 백엔드]\r\n" +
                "categories: [crlf-cat]\r\n" +
                "thumbnail: \"https://example.com/crlf-thumb.png\"\r\n" +
                "---\r\n\r\n" +
                "![본문 이미지](https://example.com/body.png)\r\n"

        val meta = PostMetaExtractor.extract(crlfContent)
        val thumbnail = PostPreviewExtractor.extractThumbnail(crlfContent)

        assertThat(meta.tags).containsExactly("crlf-tag", "백엔드")
        assertThat(meta.categories).containsExactly("crlf-cat")
        assertThat(thumbnail).isEqualTo("https://example.com/crlf-thumb.png")
    }

    @Test
    fun `front matter 와 상단 메타 라인이 함께 있을 때 두 블록을 모두 병합하고 비메타 콜론 라인에서 스캔을 중단한다`() {
        val combinedContent =
            """
            ---
            tag: 프론트태그
            ---
            tags: 상단태그
            category: 상단카테고리
            author: 메타키가아닌콜론라인
            tags: 본문중간태그
            """.trimIndent()
        val nonMetaColonOnly = "author: 작성자\n본문입니다."

        val combinedMeta = PostMetaExtractor.extract(combinedContent)
        val nonMetaColonResult = PostMetaExtractor.extract(nonMetaColonOnly)

        assertThat(combinedMeta.tags).containsExactly("프론트태그", "상단태그")
        assertThat(combinedMeta.categories).containsExactly("상단카테고리")
        assertThat(nonMetaColonResult.tags).isEmpty()
        assertThat(nonMetaColonResult.categories).isEmpty()
    }

    @Test
    fun `제로 정규식 메타 매처가 대소문자·언더스코어·공백·빈 값 경계를 정확히 판별한다`() {
        val mixedCaseHeader =
            """
              TAG  :  [mixed1]
              Tags : [mixed2]
              CATEGORY : dev
              Categories : [platform]
              THUMB : https://example.com/ignored.png
              COVER : https://example.com/ignored2.png
              Summary : 요약문
              Thumbnail : https://example.com/ignored3.png
              CoverImage : https://example.com/ignored4.png
              Cover_Image : https://example.com/ignored5.png
            tags:   
            tag: stopped-after-blank
            """.trimIndent()

        val extracted = PostMetaExtractor.extract(mixedCaseHeader)
        assertThat(extracted.tags).containsExactly("mixed1", "mixed2")
        assertThat(extracted.categories).containsExactly("dev", "platform")

        // PostHeaderMetadataMatcher 모든 길이/오매치 분기 검증
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("id", 0, 2)).isEqualTo(PostHeaderMetadataMatcher.KIND_NONE)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("foo", 0, 3)).isEqualTo(PostHeaderMetadataMatcher.KIND_NONE)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("slug", 0, 4)).isEqualTo(PostHeaderMetadataMatcher.KIND_NONE)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("title", 0, 5)).isEqualTo(PostHeaderMetadataMatcher.KIND_NONE)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("excerpt", 0, 7, includeSummaryAliases = false))
            .isEqualTo(PostHeaderMetadataMatcher.KIND_NONE)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("EXCERPT", 0, 7, includeSummaryAliases = true))
            .isEqualTo(PostHeaderMetadataMatcher.KIND_SUMMARY)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("unknown", 0, 7, includeSummaryAliases = true))
            .isEqualTo(PostHeaderMetadataMatcher.KIND_NONE)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("authored", 0, 8)).isEqualTo(PostHeaderMetadataMatcher.KIND_NONE)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("published", 0, 9)).isEqualTo(PostHeaderMetadataMatcher.KIND_NONE)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("coverimagx", 0, 10)).isEqualTo(PostHeaderMetadataMatcher.KIND_NONE)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("cover-image", 0, 11)).isEqualTo(PostHeaderMetadataMatcher.KIND_NONE)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("cover_imag\u007F", 0, 11)).isEqualTo(PostHeaderMetadataMatcher.KIND_NONE)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("description", 0, 11, includeSummaryAliases = false))
            .isEqualTo(PostHeaderMetadataMatcher.KIND_NONE)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("DESCRIPTION", 0, 11, includeSummaryAliases = true))
            .isEqualTo(PostHeaderMetadataMatcher.KIND_SUMMARY)
        assertThat(PostHeaderMetadataMatcher.matchKeyKind("author_name", 0, 11, includeSummaryAliases = true))
            .isEqualTo(PostHeaderMetadataMatcher.KIND_NONE)
        assertThat(PostHeaderMetadataMatcher.unquoteTrimmed(" '\"only-outer\"' ", 0, 16)).isEqualTo("\"only-outer\"")
        assertThat(PostHeaderMetadataMatcher.unquoteTrimmed("  \"   \"  ", 0, 9)).isNull()
    }
}
