package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.adapter.persistence.MemberAttrRepository
import com.back.boundedContexts.member.adapter.persistence.MemberRepository
import com.back.boundedContexts.member.application.event.MemberPublicProfileChangedEvent
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileAboutSectionBlock
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.support.BaseMemberApplicationServiceIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.then
import org.mockito.Mockito.reset
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.test.context.event.ApplicationEvents
import org.springframework.test.context.event.RecordApplicationEvents

@org.junit.jupiter.api.DisplayName("MemberApplicationService 테스트")
@RecordApplicationEvents
class MemberApplicationServiceTest : BaseMemberApplicationServiceIntegrationTest() {
    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Autowired
    private lateinit var memberAttrRepository: MemberAttrRepository

    @Autowired
    private lateinit var memberRepository: MemberRepository

    @Autowired
    private lateinit var passwordEncoder: PasswordEncoder

    @Autowired
    private lateinit var applicationEvents: ApplicationEvents

    @Test
    fun `회원 생성에서 profileImgUrl 을 함께 넘기면 기본 이미지 대신 저장된 이미지가 사용된다`() {
        val member =
            memberFacade.join(
                "profile-user",
                "1234",
                "프로필유저",
                "https://example.com/profile-user.png",
            )

        assertThat(member.profileImgUrl).isEqualTo("https://example.com/profile-user.png")
        assertThat(member.profileImgUrlOrDefault).isEqualTo("https://example.com/profile-user.png")
        assertThat(memberAttrRepository.findBySubjectAndName(member, "profileImgUrl"))
            .extracting("value")
            .isEqualTo("https://example.com/profile-user.png")
    }

    @Test
    fun `회원 수정은 nickname 과 profileImgUrl 을 함께 변경한다`() {
        val member = createMember("member-modify-target", "유저1")

        memberFacade.modify(
            member = member,
            nickname = "변경된유저1",
            profileImgUrl = "https://example.com/updated-user1.png",
        )

        assertThat(member.nickname).isEqualTo("변경된유저1")
        assertThat(member.name).isEqualTo("변경된유저1")
        assertThat(member.profileImgUrl).isEqualTo("https://example.com/updated-user1.png")
        assertThat(member.profileImgUrlOrDefault).isEqualTo("https://example.com/updated-user1.png")
        assertThat(memberAttrRepository.findBySubjectAndName(member, "profileImgUrl"))
            .extracting("value")
            .isEqualTo("https://example.com/updated-user1.png")
    }

    @Test
    fun `회원 수정은 공개 작성자 표시 변경 이벤트를 발행한다`() {
        val member = createMember("member-public-author-event", "변경전")

        memberFacade.modify(
            member = member,
            nickname = "변경후",
            profileImgUrl = "https://example.com/author-event.png",
        )

        val events = applicationEvents.stream(MemberPublicProfileChangedEvent::class.java).toList()
        assertThat(events).hasSize(1)
        assertThat(events.single().memberId).isEqualTo(member.id)
        assertThat(events.single().previousNickname).isEqualTo("변경전")
        assertThat(events.single().currentNickname).isEqualTo("변경후")
        assertThat(events.single().previousProfileImgUrl).isEmpty()
        assertThat(events.single().currentProfileImgUrl).isEqualTo("https://example.com/author-event.png")
    }

    @Test
    fun `modifyOrJoin 은 기존 회원이 있으면 회원 정보를 수정하고 200을 반환한다`() {
        val existingUsername = "member-modify-or-join-target"
        createMember(existingUsername, "유저1")

        val rsData =
            memberFacade.modifyOrJoin(
                username = existingUsername,
                password = "ignored-password",
                nickname = "수정유저1",
                profileImgUrl = "https://example.com/modify-or-join-user1.png",
            )

        val member = memberFacade.findByLoginId(existingUsername)!!

        assertThat(rsData.resultCode).isEqualTo("200-1")
        assertThat(rsData.msg).isEqualTo("회원 정보가 수정되었습니다.")
        assertThat(rsData.data).isEqualTo(member)
        assertThat(member.nickname).isEqualTo("수정유저1")
        assertThat(member.profileImgUrl).isEqualTo("https://example.com/modify-or-join-user1.png")
    }

    @Test
    fun `modifyOrJoin 은 기존 회원이 없으면 새 회원을 생성하고 201을 반환한다`() {
        val rsData =
            memberFacade.modifyOrJoin(
                username = "join-or-modify-user",
                password = "1234",
                nickname = "신규유저",
                profileImgUrl = "https://example.com/join-or-modify-user.png",
            )

        val member = memberFacade.findByLoginId("join-or-modify-user")!!

        assertThat(rsData.resultCode).isEqualTo("201-1")
        assertThat(rsData.msg).isEqualTo("회원가입이 완료되었습니다.")
        assertThat(rsData.data).isEqualTo(member)
        assertThat(member.nickname).isEqualTo("신규유저")
        assertThat(member.profileImgUrl).isEqualTo("https://example.com/join-or-modify-user.png")
    }

    @Test
    fun `프로필 카드 수정은 legacy attr 과 draft workspace 만 동기화한다`() {
        val member = createMember("profile-card-target", "프로필카드")

        memberFacade.modifyProfileCard(
            member = member,
            command =
                UpdateProfileCardCommand(
                    role = "Backend Engineer",
                    bio = "서비스 구조를 다룹니다",
                    aboutRole = "API 설계",
                    aboutBio = "운영 가능한 흐름을 만듭니다",
                    aboutDetails = "## 경험\n- Kotlin",
                    blogTitle = "Aquila Blog",
                    homeIntroTitle = "기록",
                    homeIntroDescription = "개발 기록",
                    blogDesign = "grid",
                    legacyBlogScheme = "light",
                    serviceLinks = listOf(MemberProfileLinkItem(icon = "rocket", label = "서비스", href = "/service")),
                    contactLinks = listOf(MemberProfileLinkItem(icon = "github", label = "GitHub", href = "https://github.com/AquilaXk")),
                ),
        )

        assertThat(memberAttrRepository.findBySubjectAndName(member, "profileRole"))
            .extracting("value")
            .isEqualTo("Backend Engineer")
        assertThat(memberAttrRepository.findBySubjectAndName(member, "blogDesign"))
            .extracting("value")
            .isEqualTo("grid")

        val draft = member.getProfileWorkspaceDraftContent()
        val published = member.getProfileWorkspacePublishedContent()
        assertThat(draft.profileRole).isEqualTo("Backend Engineer")
        assertThat(draft.blogDesign).isEqualTo("grid")
        assertThat(draft.serviceLinks).containsExactly(MemberProfileLinkItem(icon = "rocket", label = "서비스", href = "/service"))
        assertThat(published.profileRole).isEmpty()
        assertThat(published.blogDesign).isEqualTo("legacy")
    }

    @Test
    fun `프로필 workspace draft 저장은 정규화 결과를 legacy attr 과 draft 에 함께 저장한다`() {
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

        assertThat(member.profileImgUrl).isEqualTo("https://example.com/workspace.png")
        assertThat(member.profileRole).isEqualTo("Architect")
        assertThat(member.blogDesign).isEqualTo("legacy")
        assertThat(memberAttrRepository.findBySubjectAndName(member, "profileImgUrl"))
            .extracting("value")
            .isEqualTo("https://example.com/workspace.png")

        val draft = member.getProfileWorkspaceDraftContent()
        assertThat(draft.profileImageUrl).isEqualTo("https://example.com/workspace.png")
        assertThat(draft.profileRole).isEqualTo("Architect")
        assertThat(draft.aboutSections).containsExactly(
            MemberProfileAboutSectionBlock(id = "section-2", title = "경험", items = listOf("Kotlin")),
        )
        assertThat(draft.blogDesign).isEqualTo("legacy")
        assertThat(draft.legacyBlogScheme).isEqualTo("light")
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
    }

    private fun createMember(
        username: String,
        nickname: String,
    ): Member =
        memberRepository.saveAndFlush(
            Member(
                id = 0,
                username = username,
                password = passwordEncoder.encode("1234"),
                nickname = nickname,
            ),
        )
}
