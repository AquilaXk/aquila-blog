package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.adapter.persistence.MemberAttrPersistenceAdapter
import com.back.boundedContexts.member.adapter.persistence.MemberAttrRepository
import com.back.boundedContexts.member.adapter.persistence.MemberRepository
import com.back.boundedContexts.member.adapter.persistence.MemberRepositoryAdapter
import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.app.AppConfig
import com.back.global.jpa.config.JpaConfig
import com.back.global.storage.application.UploadedFileRetentionService
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase
import org.springframework.context.annotation.Import
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean

@ActiveProfiles("test")
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(
    MemberApplicationService::class,
    MemberRepositoryAdapter::class,
    MemberAttrPersistenceAdapter::class,
    MemberProfileHydrator::class,
    JpaConfig::class,
    AppConfig::class,
)
@org.junit.jupiter.api.DisplayName("MemberApplicationService 테스트")
class MemberApplicationServiceTest {
    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Autowired
    private lateinit var memberAttrRepository: MemberAttrRepository

    @Autowired
    private lateinit var memberRepository: MemberRepository

    @Autowired
    private lateinit var passwordEncoder: PasswordEncoder

    @MockitoBean
    private lateinit var uploadedFileRetentionService: UploadedFileRetentionService

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
