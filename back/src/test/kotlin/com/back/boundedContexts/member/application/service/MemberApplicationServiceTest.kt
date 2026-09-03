package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.adapter.persistence.MemberRepository
import com.back.boundedContexts.member.application.event.MemberPublicProfileChangedEvent
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileAboutSectionBlock
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.support.BaseMemberApplicationServiceIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.then
import org.mockito.Mockito.reset
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.context.event.ApplicationEvents
import org.springframework.test.context.event.RecordApplicationEvents

@org.junit.jupiter.api.DisplayName("MemberApplicationService 테스트")
@RecordApplicationEvents
class MemberApplicationServiceTest : BaseMemberApplicationServiceIntegrationTest() {
    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Autowired
    private lateinit var memberRepository: MemberRepository

    @Autowired
    private lateinit var applicationEvents: ApplicationEvents

    @Test
    fun `회원 생성은 정규화된 canonical draft와 published pair를 같은 transaction에 저장한다`() {
        val member =
            memberFacade.join(
                "profile-user",
                "1234",
                "프로필유저",
                "https://example.com/profile-user.png",
                null,
            )

        assertThat(member.getProfileWorkspaceDraftContent()).isEqualTo(
            MemberProfileWorkspaceContent(profileImageUrl = "https://example.com/profile-user.png"),
        )
        assertThat(member.getProfileWorkspacePublishedContent()).isEqualTo(member.getProfileWorkspaceDraftContent())
    }

    @Test
    fun `회원 수정은 nickname만 변경한다`() {
        val member = createMember("member-modify-target", "유저1")

        memberFacade.modify(
            member = member,
            nickname = "변경된유저1",
        )

        assertThat(member.nickname).isEqualTo("변경된유저1")
        assertThat(member.name).isEqualTo("변경된유저1")
    }

    @Test
    fun `회원 수정은 공개 작성자 표시 변경 이벤트를 발행한다`() {
        val member = createMember("member-public-author-event", "변경전")

        memberFacade.modify(
            member = member,
            nickname = "변경후",
        )

        val events = applicationEvents.stream(MemberPublicProfileChangedEvent::class.java).toList()
        assertThat(events).hasSize(1)
        assertThat(events.single().memberId).isEqualTo(member.id)
        assertThat(events.single().previousNickname).isEqualTo("변경전")
        assertThat(events.single().currentNickname).isEqualTo("변경후")
        assertThat(events.single().previousProfileImgUrl).isEmpty()
        assertThat(events.single().currentProfileImgUrl).isEmpty()
    }

    @Test
    fun `프로필 workspace draft 저장은 draft만 정규화하여 저장하고 공개 이벤트를 발행하지 않는다`() {
        val member = createMember("profile-workspace-draft", "워크스페이스")

        memberFacade.saveProfileWorkspaceDraft(
            member = member,
            content =
                MemberProfileWorkspaceContent(
                    profileImageUrl = "  https://example.com/workspace.png  ",
                    profileRole = "  Architect  ",
                    profileBio = "  경계를 정리합니다  ",
                    aboutRole = "  Backend  ",
                    aboutBio = "  테스트 가능한 구조  ",
                    aboutSections =
                        listOf(
                            MemberProfileAboutSectionBlock(title = "  "),
                            MemberProfileAboutSectionBlock(title = " 경험 ", items = listOf(" Kotlin ", " ")),
                        ),
                    blogTitle = "  블로그  ",
                    homeIntroTitle = "  홈  ",
                    homeIntroDescription = "  소개  ",
                    blogDesign = "unknown",
                    legacyBlogScheme = "light",
                ),
        )

        val draft = member.getProfileWorkspaceDraftContent()
        val published = member.getProfileWorkspacePublishedContent()
        assertThat(draft.profileImageUrl).isEqualTo("https://example.com/workspace.png")
        assertThat(draft.profileRole).isEqualTo("Architect")
        assertThat(draft.aboutSections).containsExactly(
            MemberProfileAboutSectionBlock(id = "section-2", title = "경험", items = listOf("Kotlin")),
        )
        assertThat(draft.blogDesign).isEqualTo("legacy")
        assertThat(draft.legacyBlogScheme).isEqualTo("light")
        assertThat(published).isEqualTo(MemberProfileWorkspaceContent())
        assertThat(applicationEvents.stream(MemberPublicProfileChangedEvent::class.java).toList()).isEmpty()
    }

    @Test
    fun `프로필 workspace publish 와 draft 이미지 교체는 published 이미지 보호 기준으로 sync 한다`() {
        val member = createMember("profile-workspace-image-sync", "이미지동기화")
        val publishedImageUrl = "https://example.com/published.png"
        val draftImageUrl = "https://example.com/draft.png"
        val nextDraftImageUrl = "https://example.com/next-draft.png"

        memberFacade.saveProfileWorkspaceDraft(
            member = member,
            content = MemberProfileWorkspaceContent(profileImageUrl = publishedImageUrl),
        )
        memberFacade.publishProfileWorkspace(member)

        reset(uploadedFileRetentionService)
        memberFacade.saveProfileWorkspaceDraft(
            member = member,
            content = MemberProfileWorkspaceContent(profileImageUrl = draftImageUrl),
        )

        then(uploadedFileRetentionService).should().syncProfileImage(member.id, null, draftImageUrl)

        reset(uploadedFileRetentionService)
        memberFacade.saveProfileWorkspaceDraft(
            member = member,
            content = MemberProfileWorkspaceContent(profileImageUrl = nextDraftImageUrl),
        )

        then(uploadedFileRetentionService).should().syncProfileImage(member.id, draftImageUrl, nextDraftImageUrl)

        reset(uploadedFileRetentionService)
        memberFacade.publishProfileWorkspace(member)

        then(uploadedFileRetentionService).should().syncProfileImage(member.id, publishedImageUrl, nextDraftImageUrl)
        val events = applicationEvents.stream(MemberPublicProfileChangedEvent::class.java).toList()
        assertThat(events.last().previousProfileImgUrl).isEqualTo(publishedImageUrl)
        assertThat(events.last().currentProfileImgUrl).isEqualTo(nextDraftImageUrl)
    }

    private fun createMember(
        username: String,
        nickname: String,
    ): Member = memberFacade.join(username, "1234", nickname, null, null)
}
