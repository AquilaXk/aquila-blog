package com.back.boundedContexts.post.domain.postMixin

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.time.Instant

@DisplayName("Post commentsCount decrement 안전화")
class PostHasCommentsTest {
    @Test
    @DisplayName("commentsCount attr이 없으면 delete 시 음수를 만들지 않는다")
    fun doesNotPersistNegativeWhenCommentsCountAttrMissing() {
        val post = samplePost()

        assertThat(post.commentsCountAttr).isNull()
        post.onCommentDeleted()

        assertThat(post.commentsCount).isEqualTo(0)
        assertThat(post.commentsCountAttr?.intValue).isEqualTo(0)
    }

    @Test
    @DisplayName("commentsCount가 0이면 delete 후에도 0을 유지한다")
    fun clampsExistingZeroAttr() {
        val post = samplePost()
        post.commentsCountAttr = PostAttr(1L, post, COMMENTS_COUNT, 0)

        post.onCommentDeleted()

        assertThat(post.commentsCount).isEqualTo(0)
        assertThat(post.commentsCountAttr?.intValue).isEqualTo(0)
    }

    private fun samplePost(): Post {
        val author =
            Member(
                id = 1L,
                username = "login",
                password = null,
                nickname = "nick",
                email = null,
            ).apply {
                createdAt = Instant.parse("2026-01-01T00:00:00Z")
                modifiedAt = Instant.parse("2026-01-01T00:01:00Z")
            }
        return Post(
            id = 10L,
            author = author,
            title = "title",
            content = "content",
            published = true,
            listed = true,
        ).apply {
            createdAt = Instant.parse("2026-01-02T00:00:00Z")
            modifiedAt = Instant.parse("2026-01-02T00:01:00Z")
        }
    }
}
