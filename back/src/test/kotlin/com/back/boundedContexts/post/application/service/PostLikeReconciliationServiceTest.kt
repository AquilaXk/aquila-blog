package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant

@org.junit.jupiter.api.DisplayName("PostLikeReconciliationService 테스트")
class PostLikeReconciliationServiceTest {
    private lateinit var post: Post
    private lateinit var likesAttr: PostAttr
    private lateinit var postAttrRepository: FakePostAttrRepository
    private lateinit var postLikeReconciliationService: PostLikeReconciliationService

    @BeforeEach
    fun setUp() {
        val author =
            Member(
                id = 1,
                username = "like-reconcile-author",
                password = "Abcd1234!",
                nickname = "좋아요보정작성자",
                email = "like-reconcile-author@example.com",
                apiKey = "author-api-key",
            )
        post = Post(id = 10, author = author, title = "좋아요 보정 대상", content = "content", published = true, listed = true)
        likesAttr = PostAttr(id = 100, subject = post, name = LIKES_COUNT, value = 999)
        likesAttr.createdAt = Instant.now().minusSeconds(3600)
        likesAttr.modifiedAt = Instant.now()
        postAttrRepository = FakePostAttrRepository(likesAttr)
        postLikeReconciliationService =
            PostLikeReconciliationService(
                postAttrRepository = postAttrRepository,
                postLikeRepository = FakePostLikeRepository(actualCount = 1),
            )
    }

    @Test
    fun `최근 변경된 좋아요 attr가 실제 like 개수와 다르면 보정한다`() {
        val correctedCount =
            postLikeReconciliationService.reconcileRecentlyTouchedPosts(
                lookbackHours = 24,
                limit = 10,
            )

        assertThat(correctedCount).isEqualTo(1)
        assertThat(likesAttr.intValue).isEqualTo(1)
    }

    private class FakePostAttrRepository(
        private val likesAttr: PostAttr,
    ) : PostAttrRepositoryPort {
        override fun findBySubjectAndName(
            subject: Post,
            name: String,
        ): PostAttr? = likesAttr.takeIf { it.subject == subject && it.name == name }

        override fun findBySubjectInAndNameIn(
            subjects: List<Post>,
            names: List<String>,
        ): List<PostAttr> = listOf(likesAttr).filter { it.subject in subjects && it.name in names }

        override fun incrementIntValue(
            subject: Post,
            name: String,
            delta: Int,
        ): Int = error("not used in this test")

        override fun findRecentlyModifiedByName(
            name: String,
            modifiedAfter: Instant,
            limit: Int,
        ): List<PostAttr> =
            listOf(likesAttr)
                .filter { it.name == name && it.modifiedAt.isAfter(modifiedAfter) }
                .take(limit)

        override fun save(attr: PostAttr): PostAttr = attr.also { it.modifiedAt = Instant.now() }
    }

    private class FakePostLikeRepository(
        private val actualCount: Long,
    ) : PostLikeRepositoryPort {
        override fun insertIfAbsent(
            liker: Member,
            post: Post,
        ): Long? = error("not used in this test")

        override fun save(postLike: com.back.boundedContexts.post.domain.PostLike) = error("not used in this test")

        override fun delete(postLike: com.back.boundedContexts.post.domain.PostLike) = error("not used in this test")

        override fun deleteByLikerAndPost(
            liker: Member,
            post: Post,
        ): Int = error("not used in this test")

        override fun findByLikerAndPost(
            liker: Member,
            post: Post,
        ) = error("not used in this test")

        override fun existsByLikerAndPost(
            liker: Member,
            post: Post,
        ): Boolean = error("not used in this test")

        override fun findByLikerAndPostIn(
            liker: Member,
            posts: List<Post>,
        ) = error("not used in this test")

        override fun countByPost(post: Post): Long = actualCount
    }
}
