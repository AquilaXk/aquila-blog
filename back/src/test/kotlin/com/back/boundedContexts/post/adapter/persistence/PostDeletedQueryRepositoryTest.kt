package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.adapter.persistence.MemberAttrRepository
import com.back.boundedContexts.member.adapter.persistence.MemberRepository
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.post.domain.Post
import com.back.global.jpa.config.JpaConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase
import org.springframework.context.annotation.Import
import org.springframework.data.domain.PageRequest
import org.springframework.test.context.ActiveProfiles
import java.time.Instant

@ActiveProfiles("test")
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaConfig::class, PostDeletedQueryRepository::class)
@org.junit.jupiter.api.DisplayName("PostDeletedQueryRepository 테스트")
class PostDeletedQueryRepositoryTest {
    @Autowired
    private lateinit var memberRepository: MemberRepository

    @Autowired
    private lateinit var memberAttrRepository: MemberAttrRepository

    @Autowired
    private lateinit var postRepository: PostRepository

    @Autowired
    private lateinit var postDeletedQueryRepository: PostDeletedQueryRepository

    @Test
    fun `삭제 글 목록은 작성자 프로필 이미지 versioned url을 포함한다`() {
        val author =
            memberRepository.saveAndFlush(Member(0, "deleted-author", "1234", "삭제작성자"))
        memberAttrRepository.saveAndFlush(
            MemberAttr(0, author, PROFILE_IMG_URL, "https://cdn.example.com/profiles/deleted-author.png"),
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

        assertThat(row.authorProfileImgUrl).isEqualTo("https://placehold.co/600x600?text=U_U")
    }
}
