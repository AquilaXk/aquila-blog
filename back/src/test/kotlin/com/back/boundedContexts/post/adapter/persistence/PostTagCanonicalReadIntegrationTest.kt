package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.adapter.persistence.MemberRepository
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.model.PostTagIndex
import com.back.boundedContexts.post.model.PostTagIndexId
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.support.BaseRepositoryIntegrationTest
import jakarta.persistence.EntityManager
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

    @Autowired
    private lateinit var entityManager: EntityManager

    @Test
    fun `post tag index JPA mapping은 composite key로 저장하고 조회한다`() {
        val post = post("jpa-mapping", true, true)

        entityManager.persist(PostTagIndex(post.id, "kotlin"))
        entityManager.flush()
        entityManager.clear()

        val found = entityManager.find(PostTagIndex::class.java, PostTagIndexId(post.id, "kotlin"))

        assertThat(found).isNotNull
        assertThat(found.postId).isEqualTo(post.id)
        assertThat(found.tag).isEqualTo("kotlin")
    }

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

    @Test
    fun `목록 커서 관련글 조회는 contentHtml TOAST를 제외하고 동률 정렬 tie-breaker와 count를 정확히 계산한다`() {
        jdbcTemplate.update("UPDATE post SET deleted_at = NOW() WHERE deleted_at IS NULL")
        val baseTime = java.time.Instant.parse("2026-11-14T01:00:00Z")
        val sameAuthor = memberRepository.saveAndFlush(Member(0, "toast-author-a", "1234", "작성자A"))
        val otherAuthor = memberRepository.saveAndFlush(Member(0, "toast-author-b", "1234", "작성자B"))

        val first =
            postRepository.saveAndFlush(
                Post(
                    author = sameAuthor,
                    title = "TOAST-1",
                    content = "본문 1",
                    published = true,
                    listed = true,
                    contentHtml = "<p>heavy toast html 1</p>",
                ),
            )
        val second =
            postRepository.saveAndFlush(
                Post(
                    author = sameAuthor,
                    title = "TOAST-2",
                    content = "본문 2",
                    published = true,
                    listed = true,
                    contentHtml = "<p>heavy toast html 2</p>",
                ),
            )
        val third =
            postRepository.saveAndFlush(
                Post(
                    author = otherAuthor,
                    title = "TOAST-3",
                    content = "본문 3",
                    published = true,
                    listed = true,
                    contentHtml = "<p>heavy toast html 3</p>",
                ),
            )
        listOf(first.id, second.id, third.id).forEach { id ->
            jdbcTemplate.update(
                "UPDATE post SET created_at = ?, modified_at = ? WHERE id = ?",
                java.sql.Timestamp.from(baseTime),
                java.sql.Timestamp.from(baseTime),
                id,
            )
        }
        entityManager.flush()
        entityManager.clear()

        val sessionFactory = entityManager.entityManagerFactory.unwrap(org.hibernate.SessionFactory::class.java)
        val stats = sessionFactory.statistics
        stats.isStatisticsEnabled = true
        stats.clear()

        val descSort =
            org.springframework.data.domain.Sort.by(
                org.springframework.data.domain.Sort.Direction.DESC,
                "createdAt",
            )
        val pagedDesc = postRepository.findQPagedByKw("", PageRequest.of(0, 10, descSort))
        assertThat(pagedDesc.content.map(Post::id)).containsExactly(third.id, second.id, first.id)
        assertThat(pagedDesc.content).allSatisfy { row ->
            assertThat(row.contentHtml).isNull()
            assertThat(row.author.nickname).isNotBlank()
        }
        // ID query + summary tuple join query = 2 statements (no N+1 author queries)
        assertThat(stats.prepareStatementCount).isEqualTo(2L)

        val ascSort =
            org.springframework.data.domain.Sort.by(
                org.springframework.data.domain.Sort.Direction.ASC,
                "createdAt",
            )
        val pagedAsc = postRepository.findQPagedByKw("", PageRequest.of(0, 10, ascSort))
        assertThat(pagedAsc.content.map(Post::id)).containsExactly(first.id, second.id, third.id)

        val modifiedSort =
            org.springframework.data.domain.Sort.by(
                org.springframework.data.domain.Sort.Direction.DESC,
                "modifiedAt",
            )
        val modifiedPage = postRepository.findQPagedByKw("", PageRequest.of(0, 10, modifiedSort))
        assertThat(modifiedPage.content.map(Post::id)).containsExactly(third.id, second.id, first.id)

        val authorSort =
            org.springframework.data.domain.Sort.by(
                org.springframework.data.domain.Sort.Direction.ASC,
                "authorName",
            )
        val authorSorted = postRepository.findQPagedByKw("", PageRequest.of(0, 10, authorSort))
        assertThat(authorSorted.content.map { it.author.nickname }).containsExactly("작성자A", "작성자A", "작성자B")

        val unsorted =
            postRepository.findQPagedByKwForAdmin(
                "",
                PageRequest.of(0, 10),
                "published",
            )
        assertThat(unsorted.content.map(Post::id)).containsExactly(third.id, second.id, first.id)
        assertThat(unsorted.totalElements).isEqualTo(3L)

        val unknownSort =
            postRepository.findQPagedByKw(
                "",
                PageRequest.of(
                    0,
                    10,
                    org.springframework.data.domain.Sort.by(
                        org.springframework.data.domain.Sort.Direction.DESC,
                        "unknownField",
                    ),
                ),
            )
        assertThat(unknownSort.content.map(Post::id)).containsExactly(third.id, second.id, first.id)

        val cursorRows = postRepository.findPublicByCursor(null, null, 10, PostSearchSortType1.CREATED_AT)
        assertThat(cursorRows).hasSize(3).allSatisfy { assertThat(it.contentHtml).isNull() }

        val relatedRows = postRepository.findPublicByAuthorExceptPost(sameAuthor.id, second.id, 5)
        assertThat(relatedRows.map(Post::id)).containsExactly(first.id)
        assertThat(relatedRows.single().contentHtml).isNull()

        entityManager.clear()
        val detail = postRepository.findPublicDetailById(first.id)
        assertThat(detail?.contentHtml).isEqualTo("<p>heavy toast html 1</p>")
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
