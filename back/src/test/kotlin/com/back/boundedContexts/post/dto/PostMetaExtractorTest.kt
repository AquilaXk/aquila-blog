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
        assertThat(PostMetaExtractor.cachedEntryCount()).isEqualTo(PostMetaExtractor.MAX_CACHE_ENTRIES)

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
}
