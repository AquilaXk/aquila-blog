package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.adapter.persistence.MemberAttrRepository
import com.back.boundedContexts.member.adapter.persistence.MemberRepository
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.domain.shared.memberMixin.defaultProfileImageUrl
import com.back.boundedContexts.member.domain.shared.memberMixin.encodeMemberProfileWorkspaceContent
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.AdmPostFacetCounts
import com.back.global.app.AppConfig
import com.back.support.BaseRepositoryIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.data.domain.PageRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import java.time.Instant

@org.junit.jupiter.api.DisplayName("PostDeletedQueryRepository 테스트")
class PostDeletedQueryRepositoryTest : BaseRepositoryIntegrationTest() {
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
    private lateinit var memberRepository: MemberRepository

    @Autowired
    private lateinit var memberAttrRepository: MemberAttrRepository

    @Autowired
    private lateinit var postRepository: PostRepository

    @Autowired
    private lateinit var postDeletedQueryRepository: PostDeletedQueryRepository

    @Test
    fun `영구 삭제는 현재 스키마에서 정상 동작한다`() {
        val author =
            memberRepository.saveAndFlush(Member(0, "hard-delete-author", "1234", "영구삭제작성자"))
        val post =
            postRepository.saveAndFlush(
                Post(
                    id = 0,
                    author = author,
                    title = "영구 삭제 글",
                    content = "본문",
                    published = false,
                    listed = false,
                ).apply {
                    deletedAt = Instant.parse("2026-09-01T00:00:00Z")
                },
            )

        assertThat(postDeletedQueryRepository.hardDeleteDeletedById(post.id)).isTrue()
    }

    @Test
    fun `삭제 글 목록은 published canonical 프로필 이미지 versioned url을 포함한다`() {
        val author =
            memberRepository.saveAndFlush(Member(0, "deleted-author", "1234", "삭제작성자"))
        memberAttrRepository.saveAndFlush(
            MemberAttr(
                0,
                author,
                "profileWorkspacePublished",
                encodeMemberProfileWorkspaceContent(
                    MemberProfileWorkspaceContent(profileImageUrl = "https://cdn.example.com/profiles/deleted-author.png"),
                ),
            ),
        )

        postRepository.saveAndFlush(
            Post(
                id = 0,
                author = author,
                title = "삭제 글",
                content = "본문",
                published = true,
                listed = true,
            ).apply {
                createdAt = Instant.parse("2026-03-12T00:00:00Z")
                modifiedAt = Instant.parse("2026-03-13T00:00:00Z")
                deletedAt = Instant.parse("2026-03-14T00:00:00Z")
            },
        )

        val page = postDeletedQueryRepository.findDeletedPagedByKw("", PageRequest.of(0, 10))

        assertThat(page.content).hasSize(1)
        assertThat(page.content.first().authorProfileImgUrl)
            .startsWith("https://cdn.example.com/profiles/deleted-author.png?v=")
    }

    @Test
    fun `삭제 글 목록은 canonical published 프로필 이미지가 비어 있으면 기본 이미지를 반환한다`() {
        val author =
            memberRepository.saveAndFlush(Member(0, "deleted-author-fallback", "1234", "기본이미지작성자"))
        memberAttrRepository.saveAndFlush(
            MemberAttr(
                0,
                author,
                "profileWorkspacePublished",
                encodeMemberProfileWorkspaceContent(MemberProfileWorkspaceContent()),
            ),
        )

        postRepository.saveAndFlush(
            Post(
                id = 0,
                author = author,
                title = "기본 이미지 삭제 글",
                content = "본문",
                published = true,
                listed = true,
            ).apply {
                createdAt = Instant.parse("2026-03-12T00:00:00Z")
                modifiedAt = Instant.parse("2026-03-13T00:00:00Z")
                deletedAt = Instant.parse("2026-03-14T00:00:00Z")
            },
        )

        val page = postDeletedQueryRepository.findDeletedPagedByKw("", PageRequest.of(0, 10))
        val row = page.content.first { it.authorName == "기본이미지작성자" }

        assertThat(row.authorProfileImgUrl).isEqualTo(defaultProfileImageUrl())
    }

    @Test
    fun `활성 작성자의 published workspace가 없으면 삭제 글 목록 조회를 실패한다`() {
        val author =
            memberRepository.saveAndFlush(Member(0, "missing-workspace-author", "1234", "누락작성자"))
        postRepository.saveAndFlush(
            Post(
                id = 0,
                author = author,
                title = "workspace 누락 삭제 글",
                content = "본문",
                published = true,
                listed = true,
            ).apply { deletedAt = Instant.parse("2026-03-14T00:00:00Z") },
        )

        assertThatThrownBy {
            postDeletedQueryRepository.findDeletedPagedByKw("", PageRequest.of(0, 10))
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Active post author profile workspace is missing or invalid")
    }

    @Test
    fun `활성 작성자의 malformed published workspace는 삭제 글 목록 조회를 실패한다`() {
        val author =
            memberRepository.saveAndFlush(Member(0, "malformed-workspace-author", "1234", "손상작성자"))
        memberAttrRepository.saveAndFlush(
            MemberAttr(0, author, "profileWorkspacePublished", "{malformed"),
        )
        postRepository.saveAndFlush(
            Post(
                id = 0,
                author = author,
                title = "workspace 손상 삭제 글",
                content = "본문",
                published = true,
                listed = true,
            ).apply { deletedAt = Instant.parse("2026-03-14T00:00:00Z") },
        )

        assertThatThrownBy {
            postDeletedQueryRepository.findDeletedPagedByKw("", PageRequest.of(0, 10))
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Active post author profile workspace is missing or invalid")
    }

    @Test
    fun `삭제 회원의 published 프로필 이미지가 남아 있어도 기본 이미지를 반환한다`() {
        val author =
            memberRepository.saveAndFlush(Member(0, "soft-deleted-author", "1234", "삭제예정작성자"))
        memberAttrRepository.saveAndFlush(
            MemberAttr(
                0,
                author,
                "profileWorkspacePublished",
                encodeMemberProfileWorkspaceContent(
                    MemberProfileWorkspaceContent(profileImageUrl = "https://cdn.example.com/profiles/stale.png"),
                ),
            ),
        )
        val post =
            postRepository.saveAndFlush(
                Post(
                    id = 0,
                    author = author,
                    title = "삭제 회원의 삭제 글",
                    content = "본문",
                    published = true,
                    listed = true,
                ).apply { deletedAt = Instant.parse("2026-03-14T00:00:00Z") },
            )
        author.softDelete(Instant.parse("2026-03-15T00:00:00Z"))
        memberRepository.saveAndFlush(author)

        val page = postDeletedQueryRepository.findDeletedPagedByKw("", PageRequest.of(0, 20))
        val row = page.content.first { it.id == post.id }

        assertThat(row.authorProfileImgUrl).isEqualTo(defaultProfileImageUrl())
    }

    @Test
    fun `가득 찬 1페이지와 LIKE 특수문자 키워드는 카운트 쿼리와 escapeLike를 정확히 실행하고 2페이지 부분 조회는 카운트를 추론한다`() {
        val author =
            memberRepository.saveAndFlush(Member(0, "paging-escape-author", "1234", "페이징작성자"))
        memberAttrRepository.saveAndFlush(
            MemberAttr(
                0,
                author,
                "profileWorkspacePublished",
                encodeMemberProfileWorkspaceContent(MemberProfileWorkspaceContent()),
            ),
        )
        listOf("escape 100%_a\\one", "escape 100%_a\\two", "escape 100%_a\\three").forEachIndexed { idx, title ->
            postRepository.saveAndFlush(
                Post(
                    id = 0,
                    author = author,
                    title = title,
                    content = "본문 $idx",
                    published = true,
                    listed = true,
                ).apply {
                    createdAt = Instant.parse("2026-03-10T00:00:00Z").plusSeconds(idx.toLong())
                    modifiedAt = createdAt
                    deletedAt = Instant.parse("2026-03-20T00:00:00Z").plusSeconds(idx.toLong())
                },
            )
        }
        postRepository.saveAndFlush(
            Post(
                id = 0,
                author = author,
                title = "ordinary other deleted post",
                content = "other",
                published = true,
                listed = true,
            ).apply {
                deletedAt = Instant.parse("2026-03-19T00:00:00Z")
            },
        )

        val fullFirstPageNoKw = postDeletedQueryRepository.findDeletedPagedByKw("", PageRequest.of(0, 2))
        assertThat(fullFirstPageNoKw.content).hasSize(2)
        assertThat(fullFirstPageNoKw.totalElements).isGreaterThanOrEqualTo(4)

        val fullFirstPageWithSpecialKw =
            postDeletedQueryRepository.findDeletedPagedByKw("100%_a\\", PageRequest.of(0, 2))
        assertThat(fullFirstPageWithSpecialKw.content).hasSize(2)
        assertThat(fullFirstPageWithSpecialKw.totalElements).isEqualTo(3)

        val partialSecondPage =
            postDeletedQueryRepository.findDeletedPagedByKw("100%_a\\", PageRequest.of(1, 2))
        assertThat(partialSecondPage.content).hasSize(1)
        assertThat(partialSecondPage.totalElements).isEqualTo(3)
    }

    @Test
    fun `관리자 게시물 상태별 건수와 활성 글 조회·좋아요 합계를 단일 스캔으로 집계한다`() {
        val baseline = postDeletedQueryRepository.getAdminPostFacetCounts()
        val author =
            memberRepository.saveAndFlush(Member(0, "facet-counts-author", "1234", "집계작성자"))

        postRepository.saveAndFlush(
            Post(
                id = 0,
                author = author,
                title = "발행 공개 글",
                content = "본문 1",
                published = true,
                listed = true,
                likesCount = 4,
                hitCount = 15,
            ),
        )
        postRepository.saveAndFlush(
            Post(
                id = 0,
                author = author,
                title = "발행 일부공개 글",
                content = "본문 2",
                published = true,
                listed = false,
                likesCount = 2,
                hitCount = 7,
            ),
        )
        postRepository.saveAndFlush(
            Post(
                id = 0,
                author = author,
                title = "임시저장 초안 글",
                content = "본문 3",
                published = false,
                listed = false,
                isTempDraft = true,
                likesCount = 0,
                hitCount = 3,
            ),
        )
        postRepository.saveAndFlush(
            Post(
                id = 0,
                author = author,
                title = "비공개 글",
                content = "본문 4",
                published = false,
                listed = false,
                isTempDraft = false,
                likesCount = 1,
                hitCount = 5,
            ),
        )
        postRepository.saveAndFlush(
            Post(
                id = 0,
                author = author,
                title = "소프트 삭제 글",
                content = "본문 5",
                published = true,
                listed = true,
                likesCount = 88,
                hitCount = 99,
            ).apply {
                deletedAt = Instant.parse("2026-09-02T00:00:00Z")
            },
        )

        val updated = postDeletedQueryRepository.getAdminPostFacetCounts()

        assertThat(updated.all - baseline.all).isEqualTo(4L)
        assertThat(updated.published - baseline.published).isEqualTo(2L)
        assertThat(updated.draft - baseline.draft).isEqualTo(1L)
        assertThat(updated.privateCount - baseline.privateCount).isEqualTo(1L)
        assertThat(updated.unlisted - baseline.unlisted).isEqualTo(1L)
        assertThat(updated.deleted - baseline.deleted).isEqualTo(1L)
        assertThat(updated.totalHitCount - baseline.totalHitCount).isEqualTo(30L)
        assertThat(updated.totalLikesCount - baseline.totalLikesCount).isEqualTo(7L)
    }

    @Test
    fun `관리자 집계 쿼리 결과가 비어 있으면 0 기본값을 반환한다`() {
        val emptyJdbcTemplate = mock(JdbcTemplate::class.java)
        `when`(
            emptyJdbcTemplate.query(
                anyString(),
                any<RowMapper<AdmPostFacetCounts>>(),
            ),
        ).thenReturn(emptyList())

        val fallback = PostDeletedQueryRepository(emptyJdbcTemplate).getAdminPostFacetCounts()

        assertThat(fallback.all).isZero()
        assertThat(fallback.published).isZero()
        assertThat(fallback.draft).isZero()
        assertThat(fallback.privateCount).isZero()
        assertThat(fallback.unlisted).isZero()
        assertThat(fallback.deleted).isZero()
        assertThat(fallback.totalHitCount).isZero()
        assertThat(fallback.totalLikesCount).isZero()
    }
}
