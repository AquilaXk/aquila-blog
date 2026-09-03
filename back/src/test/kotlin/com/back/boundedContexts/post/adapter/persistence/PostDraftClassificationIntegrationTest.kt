package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.adapter.persistence.MemberAttrRepository
import com.back.boundedContexts.member.adapter.persistence.MemberRepository
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.post.domain.Post
import com.back.support.BaseRepositoryIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort

@org.junit.jupiter.api.DisplayName("Post draft classification integration tests")
class PostDraftClassificationIntegrationTest : BaseRepositoryIntegrationTest() {
    @Autowired
    private lateinit var memberRepository: MemberRepository

    @Autowired
    private lateinit var memberAttrRepository: MemberAttrRepository

    @Autowired
    private lateinit var postRepository: PostRepository

    @Test
    fun `admin draft and private filters use only the active marker relationship`() {
        val trackedRenamed = post("tracked-renamed", "Renamed draft", published = false, listed = false)
        val untrackedLegacyTitle = post("untracked-legacy", "임시글", published = false, listed = false)
        val trackedListed = post("tracked-listed", "임시글", published = false, listed = true)
        val published = post("published-control", "임시글", published = true, listed = true)
        markActiveDraft(trackedRenamed)
        markActiveDraft(trackedListed)

        val pageable = PageRequest.of(0, 20, Sort.by(Sort.Direction.ASC, "id"))
        val draft = postRepository.findQPagedByKwForAdmin("", pageable, "draft")
        val privatePosts = postRepository.findQPagedByKwForAdmin("", pageable, "private")
        val fixtureIds = setOf(trackedRenamed.id, untrackedLegacyTitle.id, trackedListed.id, published.id)
        val draftFixtureIds = draft.content.map(Post::id).filter(fixtureIds::contains)
        val privateFixtureIds = privatePosts.content.map(Post::id).filter(fixtureIds::contains)

        assertThat(draftFixtureIds).containsExactly(trackedRenamed.id, trackedListed.id)
        assertThat(privateFixtureIds).containsExactly(untrackedLegacyTitle.id)
        assertThat((draftFixtureIds + privateFixtureIds).toSet())
            .containsExactlyInAnyOrder(trackedRenamed.id, trackedListed.id, untrackedLegacyTitle.id)
    }

    private fun post(
        username: String,
        title: String,
        published: Boolean,
        listed: Boolean,
    ): Post {
        val author = memberRepository.saveAndFlush(Member(0, username, "1234", username))
        return postRepository.saveAndFlush(
            Post(
                author = author,
                title = title,
                content = "body",
                published = published,
                listed = listed,
            ),
        )
    }

    private fun markActiveDraft(post: Post) {
        memberAttrRepository.saveAndFlush(MemberAttr(0, post.author, "activeTempDraftPostId", post.id.toString()))
    }
}
