package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.adapter.persistence.MemberRepository
import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.service.PostHydrationService
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.global.app.AppConfig
import com.back.support.BaseRepositoryIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.beans.factory.annotation.Autowired
import java.time.Instant

@DisplayName("Post summary TOAST 본문 프로젝션 상한 최적화 통합 테스트")
class PostSummaryProjectionIntegrationTest : BaseRepositoryIntegrationTest() {
    companion object {
        @JvmStatic
        @BeforeAll
        fun setUpAppConfig() {
            AppConfig(
                siteBackUrl = "http://localhost:8080",
                siteFrontUrl = "http://localhost:3000",
            )
        }
    }

    @Autowired
    private lateinit var postRepository: PostRepository

    @Autowired
    private lateinit var memberRepository: MemberRepository

    private val postAttrRepository: PostAttrRepositoryPort = mock(PostAttrRepositoryPort::class.java)
    private val memberAttrRepository: MemberAttrRepositoryPort = mock(MemberAttrRepositoryPort::class.java)
    private val postHydrationService: PostHydrationService = PostHydrationService(postAttrRepository, memberAttrRepository)

    @Test
    fun `대용량 100KB 본문 글도 요약 조회 시 TOAST 본문이 상한 절삭되어 로드되지만 메타데이터와 썸네일은 100퍼센트 동일하게 추출된다`() {
        val author =
            memberRepository.saveAndFlush(
                Member(0, "summary-author", "1234", "요약작성자").apply {
                    setProfileWorkspacePublishedContent(
                        com.back.boundedContexts.member.domain.shared.memberMixin
                            .MemberProfileWorkspaceContent(),
                    )
                },
            )

        // 1) 썸네일이 명시된 100KB 대용량 글
        val largeBody100k = "가나다라마바사아자차카타파하".repeat(7_000) // ~100KB
        val postWithExplicitThumbnail =
            postRepository.saveAndFlush(
                Post(
                    author = author,
                    title = "명시 썸네일 대용량 글",
                    content =
                        """
                        ---
                        tags: [대용량, 성능, 최적화]
                        category: 백엔드
                        ---
                        
                        $largeBody100k
                        """.trimIndent(),
                    thumbnail = "https://example.com/explicit-thumb.png",
                    published = true,
                    listed = true,
                ),
            )

        // 2) 썸네일이 미지정되어 본문 첫 이미지에서 추출해야 하는 100KB 대용량 글
        val postWithBodyImage =
            postRepository.saveAndFlush(
                Post(
                    author = author,
                    title = "본문 이미지 추출 대용량 글",
                    content =
                        """
                        ---
                        tags: [이미지추출, 성능]
                        categories: [플랫폼]
                        ---
                        
                        # 본문 시작
                        
                        ![첫번째 이미지](https://example.com/body-extracted.png)
                        
                        $largeBody100k
                        """.trimIndent(),
                    thumbnail = null,
                    published = true,
                    listed = true,
                ),
            )

        // 요약 쿼리 (인접 글 조회 또는 작성자 관련 글 조회)
        val loadedAdjacent =
            postRepository.findPreviousPublicPost(
                Instant.now().plusSeconds(60),
                Long.MAX_VALUE,
            )
        assertThat(loadedAdjacent).isNotNull
        // thumbnail이 없는 글은 16384자로 절삭됨
        assertThat(loadedAdjacent!!.content.length).isLessThanOrEqualTo(16_384)
        assertThat(loadedAdjacent.content.length).isLessThan(postWithBodyImage.content.length)

        // PostHydrationService 호출 계약 검증
        postHydrationService.hydratePostAttrs(loadedAdjacent)

        // FeedPostDto 변환 시 썸네일 및 태그/카테고리 추출이 100% 정상 동작하는지 검증
        val feedDto = FeedPostDto.from(loadedAdjacent) { _, _, _ -> }
        assertThat(feedDto.thumbnail).isEqualTo("https://example.com/body-extracted.png")
        assertThat(feedDto.tags).containsExactly("이미지추출", "성능")
        assertThat(feedDto.category).containsExactly("플랫폼")

        // 썸네일이 명시된 글의 요약 조회
        val relatedPosts =
            postRepository.findPublicByAuthorExceptPost(
                authorId = author.id,
                excludePostId = postWithBodyImage.id,
                limit = 5,
            )
        assertThat(relatedPosts).hasSize(1)
        val loadedExplicit = relatedPosts[0]
        assertThat(loadedExplicit.id).isEqualTo(postWithExplicitThumbnail.id)
        // thumbnail이 있으므로 4096자로 절삭됨
        assertThat(loadedExplicit.content.length).isLessThanOrEqualTo(4_096)
        assertThat(loadedExplicit.content.length).isLessThan(postWithExplicitThumbnail.content.length)

        val explicitFeedDto = FeedPostDto.from(loadedExplicit) { _, _, _ -> }
        assertThat(explicitFeedDto.thumbnail).isEqualTo("https://example.com/explicit-thumb.png")
        assertThat(explicitFeedDto.tags).containsExactly("대용량", "성능", "최적화")
        assertThat(explicitFeedDto.category).containsExactly("백엔드")
    }

    @Test
    fun `역링크 후보 조회는 경계 인자를 거부하고 limit 포화 시 경로 직접 참조 글을 병합하며 본문을 128KB로 절삭한다`() {
        val author =
            memberRepository.saveAndFlush(
                Member(0, "backlink-author", "1234", "역링크작성자").apply {
                    setProfileWorkspacePublishedContent(
                        com.back.boundedContexts.member.domain.shared.memberMixin
                            .MemberProfileWorkspaceContent(),
                    )
                },
            )
        val target =
            postRepository.saveAndFlush(
                Post(author = author, title = "Target Architecture", content = "대상 본문", published = true, listed = true),
            )
        val olderPathLinker =
            postRepository.saveAndFlush(
                Post(
                    author = author,
                    title = "Path Linker",
                    content = "참고: [대상](/posts/${target.id}) " + "x".repeat(140_000),
                    published = true,
                    listed = true,
                ),
            )
        val newerGenericWikilink =
            postRepository.saveAndFlush(
                Post(
                    author = author,
                    title = "Generic Wikilink",
                    content = "다른 글 [[Unrelated Topic]]",
                    published = true,
                    listed = true,
                ),
            )
        postRepository.saveAndFlush(
            Post(
                author = author,
                title = "Unlisted Linker",
                content = "비노출 [대상](/posts/${target.id})",
                published = true,
                listed = false,
            ),
        )

        assertThat(postRepository.findPublicBacklinkCandidates(0L, 10)).isEmpty()
        assertThat(postRepository.findPublicBacklinkCandidates(target.id, 0)).isEmpty()

        val saturatedWithPath = postRepository.findPublicBacklinkCandidates(target.id, 1)
        assertThat(saturatedWithPath.map { it.id }).containsExactly(olderPathLinker.id)
        assertThat(saturatedWithPath.first().content.length).isLessThanOrEqualTo(131_072)

        val saturatedNoPath = postRepository.findPublicBacklinkCandidates(999_999L, 1)
        assertThat(saturatedNoPath.map { it.id }).containsExactly(newerGenericWikilink.id)

        val fullCandidates = postRepository.findPublicBacklinkCandidates(target.id, 10)
        assertThat(fullCandidates.map { it.id }).containsExactly(newerGenericWikilink.id, olderPathLinker.id)
    }
}
