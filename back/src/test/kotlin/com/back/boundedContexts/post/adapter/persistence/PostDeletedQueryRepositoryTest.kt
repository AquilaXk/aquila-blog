package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.adapter.persistence.MemberAttrRepository
import com.back.boundedContexts.member.adapter.persistence.MemberRepository
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.domain.shared.memberMixin.defaultProfileImageUrl
import com.back.boundedContexts.member.domain.shared.memberMixin.encodeMemberProfileWorkspaceContent
import com.back.boundedContexts.post.domain.Post
import com.back.support.BaseRepositoryIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.data.domain.PageRequest
import java.time.Instant

@org.junit.jupiter.api.DisplayName("PostDeletedQueryRepository 테스트")
class PostDeletedQueryRepositoryTest : BaseRepositoryIntegrationTest() {
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
    fun `삭제 글 목록은 작성자 이미지가 없으면 기본 프로필 이미지를 반환한다`() {
        val author =
            memberRepository.saveAndFlush(Member(0, "deleted-author-fallback", "1234", "기본이미지작성자"))

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
}
