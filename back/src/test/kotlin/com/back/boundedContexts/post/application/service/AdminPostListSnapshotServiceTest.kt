package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.domain.Post
import com.back.global.app.AppConfig
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.util.Ut
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.time.Instant

class AdminPostListSnapshotServiceTest {
    companion object {
        @JvmStatic
        @BeforeAll
        fun setUpAppConfig() {
            AppConfig(
                siteBackUrl = "http://localhost:8080",
                siteFrontUrl = "http://localhost:3000",
            )
            Ut.JSON.objectMapper = jacksonObjectMapper()
        }
    }

    @Test
    fun `관리자 첫 페이지 스냅샷은 항목마다 isTempDraft를 개별 호출하지 않고 일괄 판별한다`() {
        val postUseCase = mock(PostUseCase::class.java)
        val service = AdminPostListSnapshotService(postUseCase)
        val authorA = member(1L)
        val authorB = member(2L)
        val tempTrackedPost = post(10L, authorA, isTempDraft = false)
        val normalPost = post(20L, authorB, isTempDraft = false)
        val page = PagedResult(content = listOf(tempTrackedPost, normalPost), page = 1, pageSize = 20, totalElements = 2)
        `when`(postUseCase.findPagedByKwForAdmin("", PostSearchSortType1.MODIFIED_AT, 1, 20, "all"))
            .thenReturn(page)
        `when`(postUseCase.resolveTempDraftPostIds(page.content))
            .thenReturn(setOf(10L))

        val result = service.getFirstPageSnapshot(PostSearchSortType1.MODIFIED_AT)

        assertThat(result.content).hasSize(2)
        assertThat(result.content.map { it.id to it.tempDraft })
            .containsExactly(10L to true, 20L to false)
        verify(postUseCase).resolveTempDraftPostIds(page.content)
        verify(postUseCase, never()).isTempDraft(tempTrackedPost)
        verify(postUseCase, never()).isTempDraft(normalPost)
    }

    private fun member(id: Long): Member =
        Member(id = id, username = "user-$id", nickname = "작성자$id", apiKey = "api-key-$id").also {
            val now = Instant.now()
            it.createdAt = now
            it.modifiedAt = now
            it.setProfileWorkspacePublishedContent(
                MemberProfileWorkspaceContent(profileImageUrl = "https://cdn.example.com/profiles/user-$id.png"),
            )
            it.getProfileWorkspacePublishedAttr().apply {
                createdAt = now
                modifiedAt = now
            }
        }

    private fun post(
        id: Long,
        author: Member,
        isTempDraft: Boolean,
    ): Post =
        Post(
            id = id,
            author = author,
            title = "제목-$id",
            content = "본문-$id",
            published = !isTempDraft,
            listed = !isTempDraft,
            isTempDraft = isTempDraft,
        ).also {
            val now = Instant.now()
            it.createdAt = now
            it.modifiedAt = now
        }
}
