package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.META_TAGS_INDEX
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.BDDMockito.willThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.times

@DisplayName("PostTagIndexService 테스트")
class PostTagIndexServiceTest {
    private val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
    private val postTagIndexRepository: PostTagIndexRepositoryPort = mock(PostTagIndexRepositoryPort::class.java)
    private val postAttrRepository: PostAttrRepositoryPort = mock(PostAttrRepositoryPort::class.java)
    private val service =
        PostTagIndexService(
            postRepository = postRepository,
            postTagIndexRepository = postTagIndexRepository,
            postAttrRepository = postAttrRepository,
            tagsLocalCacheTtlSeconds = 180,
        )

    @Test
    @DisplayName("공개 태그 집계는 repository 결과를 캐시하고 명시 evict 뒤 다시 조회한다")
    fun cachePublicTagCountsUntilEvicted() {
        // given
        given(postTagIndexRepository.findAllPublicTagCounts())
            .willReturn(
                listOf(
                    PostTagIndexRepositoryPort.TagCountRow("spring", 3),
                    PostTagIndexRepositoryPort.TagCountRow("kotlin", 2),
                ),
            )

        // when
        val first = service.getPublicTagCounts()
        val cached = service.getPublicTagCounts()
        service.evictPublicTagCountsCache()
        val refreshed = service.getPublicTagCounts()

        // then
        assertThat(first.map { it.tag }).containsExactly("spring", "kotlin")
        assertThat(cached).isSameAs(first)
        assertThat(refreshed.map { it.count }).containsExactly(3, 2)
        then(postTagIndexRepository).should(times(2)).findAllPublicTagCounts()
    }

    @Test
    @DisplayName("집계 repository 실패 시 legacy metaTagsIndex 값으로 fallback한다")
    fun fallbackToLegacyTagIndexRows() {
        // given
        given(postTagIndexRepository.findAllPublicTagCounts()).willThrow(RuntimeException("aggregate unavailable"))
        given(postRepository.findAllPublicListedTagIndexes(META_TAGS_INDEX))
            .willReturn(listOf("|spring|kotlin|", "|spring|", "| kotlin |spring|"))

        // when
        val result = service.getPublicTagCounts()

        // then
        assertThat(result.map { it.tag to it.count })
            .containsExactly("spring" to 3, "kotlin" to 2)
    }

    @Test
    @DisplayName("legacy index도 비어 있으면 빈 태그 집계를 반환한다")
    fun fallbackEmptyLegacyRows() {
        // given
        given(postTagIndexRepository.findAllPublicTagCounts()).willThrow(RuntimeException("aggregate unavailable"))
        given(postRepository.findAllPublicListedTagIndexes(META_TAGS_INDEX)).willReturn(emptyList())

        // when
        val result = service.getPublicTagCounts()

        // then
        assertThat(result).isEmpty()
    }

    @Test
    @DisplayName("본문 태그를 attr와 정규화 테이블에 동기화하고 replace 실패는 전파하지 않는다")
    fun syncMetaTagIndexAttrAndSuppressReplaceFailure() {
        // given
        val post = testPost(content = "tags: kotlin, spring, kotlin\n\n본문")
        val attr = PostAttr(1, post, META_TAGS_INDEX, "")
        given(postAttrRepository.findBySubjectAndName(post, META_TAGS_INDEX)).willReturn(attr)
        given(postAttrRepository.save(attr)).willReturn(attr)
        willThrow(RuntimeException("tag table unavailable"))
            .given(postTagIndexRepository)
            .replacePostTags(post.id, listOf("kotlin", "spring"))

        // when
        service.syncMetaTagIndexAttr(post)

        // then
        assertThat(attr.strValue).isEqualTo("|kotlin|spring|")
        then(postAttrRepository).should().save(attr)
        then(postTagIndexRepository).should().replacePostTags(post.id, listOf("kotlin", "spring"))
    }

    @Test
    @DisplayName("태그가 없고 기존 attr 값이 같으면 attr 저장 없이 정규화 테이블만 갱신한다")
    fun syncEmptyTagsWithoutSavingSameAttr() {
        // given
        val post = testPost(content = "본문만 있음")
        val attr = PostAttr(1, post, META_TAGS_INDEX, "")
        given(postAttrRepository.findBySubjectAndName(post, META_TAGS_INDEX)).willReturn(attr)

        // when
        service.syncMetaTagIndexAttr(post)

        // then
        assertThat(attr.strValue).isEqualTo("")
        then(postAttrRepository).should().findBySubjectAndName(post, META_TAGS_INDEX)
        then(postAttrRepository).should(never()).save(attr)
        then(postTagIndexRepository).should().replacePostTags(post.id, emptyList())
    }

    private fun testPost(content: String): Post =
        Post(
            id = 10,
            author = Member(id = 1, username = "author", nickname = "작성자", apiKey = "author-api-key"),
            title = "제목",
            content = content,
            published = true,
            listed = true,
        )
}
