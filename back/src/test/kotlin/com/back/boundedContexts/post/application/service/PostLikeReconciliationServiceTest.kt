package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.post.adapter.out.persistence.PostAttrRepository
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest
@Transactional
class PostLikeReconciliationServiceTest {
    @Autowired
    private lateinit var memberApplicationService: MemberApplicationService

    @Autowired
    private lateinit var postApplicationService: PostApplicationService

    @Autowired
    private lateinit var postAttrRepository: PostAttrRepository

    @Autowired
    private lateinit var postLikeReconciliationService: PostLikeReconciliationService

    @Test
    fun `최근 변경된 좋아요 attr가 실제 like 개수와 다르면 보정한다`() {
        val author =
            memberApplicationService.join(
                username = "like-reconcile-author",
                password = "Abcd1234!",
                nickname = "좋아요보정작성자",
                profileImgUrl = null,
                email = "like-reconcile-author@example.com",
            )
        val liker =
            memberApplicationService.join(
                username = "like-reconcile-liker",
                password = "Abcd1234!",
                nickname = "좋아요보정사용자",
                profileImgUrl = null,
                email = "like-reconcile-liker@example.com",
            )

        val post =
            postApplicationService.write(
                author = author,
                title = "좋아요 보정 대상",
                content = "content",
                published = true,
                listed = true,
            )

        postApplicationService.like(post, liker)

        val likesAttr = postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)!!
        likesAttr.intValue = 999
        postAttrRepository.save(likesAttr)

        val correctedCount =
            postLikeReconciliationService.reconcileRecentlyTouchedPosts(
                lookbackHours = 24,
                limit = 10,
            )

        val refreshedAttr = postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)!!
        assertThat(correctedCount).isEqualTo(1)
        assertThat(refreshedAttr.intValue).isEqualTo(1)
    }
}
