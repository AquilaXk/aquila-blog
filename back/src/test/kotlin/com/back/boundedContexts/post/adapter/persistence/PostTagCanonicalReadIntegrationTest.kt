package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.adapter.persistence.MemberRepository
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.support.BaseRepositoryIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.data.domain.PageRequest
import org.springframework.jdbc.core.JdbcTemplate

@org.junit.jupiter.api.DisplayName("Post tag canonical read 테스트")
class PostTagCanonicalReadIntegrationTest : BaseRepositoryIntegrationTest() {
    @Autowired
    private lateinit var memberRepository: MemberRepository

    @Autowired
    private lateinit var postRepository: PostRepository

    @Autowired
    private lateinit var postAttrRepository: PostAttrRepository

    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    @Test
    fun `태그 페이지는 post_tag_index만 읽고 공개 listed 결과와 추정 total을 반환한다`() {
        val publicOlder = post("public-older", true, true)
        val publicNewest = post("public-newest", true, true)
        val privatePost = post("private", false, false)
        val unlistedPost = post("unlisted", true, false)
        val legacyOnly = post("legacy-only", true, true)
        postAttrRepository.saveAndFlush(PostAttr(0, legacyOnly, "metaTagsIndex", "|kotlin|"))
        val deletedPost =
            post("deleted", true, true)
                .apply {
                    softDelete()
                }.also(postRepository::saveAndFlush)

        listOf(publicNewest, publicOlder, privatePost, unlistedPost, deletedPost).forEach(::insertKotlinTag)

        val page =
            postRepository.findQPagedByKwAndTag(
                "",
                "Kotlin",
                PageRequest.of(0, 10, PostSearchSortType1.CREATED_AT.sortBy),
            )

        assertThat(page.content.map(Post::id)).containsExactly(publicNewest.id, publicOlder.id)
        assertThat(page.totalElements).isEqualTo(2)
    }

    @Test
    fun `태그 커서는 post_tag_index만 읽고 createdAt cursor 뒤 공개 listed 글만 반환한다`() {
        val oldest = post("oldest", true, true)
        val middle = post("middle", true, true)
        val newest = post("newest", true, true)
        val privatePost = post("private", false, false)

        listOf(newest, middle, oldest, privatePost).forEach(::insertKotlinTag)

        val rows =
            postRepository.findPublicByTagCursor(
                "Kotlin",
                newest.createdAt.toEpochMilli(),
                newest.id,
                10,
                PostSearchSortType1.CREATED_AT,
            )

        assertThat(rows.map(Post::id)).containsExactly(middle.id, oldest.id)
    }

    @Test
    fun `keyword 태그 match와 relevance는 post_tag_index만 사용한다`() {
        val tagged = post("tagged", true, true)
        val contentOnly = post("content-only", true, true, "kotlin 본문")
        insertKotlinTag(tagged)

        val page =
            postRepository.findQPagedByKw(
                "kotlin",
                PageRequest.of(0, 10, PostSearchSortType1.CREATED_AT.sortBy),
            )

        assertThat(page.content.map(Post::id)).containsExactly(tagged.id, contentOnly.id)
    }

    private fun post(
        title: String,
        published: Boolean,
        listed: Boolean,
        content: String = "본문",
    ): Post {
        val author = memberRepository.saveAndFlush(Member(0, "tag-$title", "1234", title))
        return postRepository.saveAndFlush(
            Post(
                author = author,
                title = title,
                content = content,
                published = published,
                listed = listed,
            ),
        )
    }

    private fun insertKotlinTag(post: Post) {
        jdbcTemplate.update("INSERT INTO post_tag_index (post_id, tag) VALUES (?, ?)", post.id, "kotlin")
    }
}
