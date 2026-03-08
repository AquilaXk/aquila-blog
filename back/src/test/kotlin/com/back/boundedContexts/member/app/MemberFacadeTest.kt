package com.back.boundedContexts.member.app

import com.back.boundedContexts.member.out.shared.MemberAttrRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class MemberFacadeTest {
    @Autowired
    private lateinit var memberFacade: MemberFacade

    @Autowired
    private lateinit var memberAttrRepository: MemberAttrRepository

    @Test
    fun `회원 생성에서 profileImgUrl 을 함께 넘기면 기본 이미지 대신 저장된 이미지가 사용된다`() {
        val member = memberFacade.join(
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
        val member = memberFacade.findByUsername("user1")!!

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
        val rsData = memberFacade.modifyOrJoin(
            username = "user1",
            password = "ignored-password",
            nickname = "수정유저1",
            profileImgUrl = "https://example.com/modify-or-join-user1.png",
        )

        val member = memberFacade.findByUsername("user1")!!

        assertThat(rsData.resultCode).isEqualTo("200-1")
        assertThat(rsData.msg).isEqualTo("회원 정보가 수정되었습니다.")
        assertThat(rsData.data).isEqualTo(member)
        assertThat(member.nickname).isEqualTo("수정유저1")
        assertThat(member.profileImgUrl).isEqualTo("https://example.com/modify-or-join-user1.png")
    }

    @Test
    fun `modifyOrJoin 은 기존 회원이 없으면 새 회원을 생성하고 201을 반환한다`() {
        val rsData = memberFacade.modifyOrJoin(
            username = "join-or-modify-user",
            password = "1234",
            nickname = "신규유저",
            profileImgUrl = "https://example.com/join-or-modify-user.png",
        )

        val member = memberFacade.findByUsername("join-or-modify-user")!!

        assertThat(rsData.resultCode).isEqualTo("201-1")
        assertThat(rsData.msg).isEqualTo("회원가입이 완료되었습니다.")
        assertThat(rsData.data).isEqualTo(member)
        assertThat(member.nickname).isEqualTo("신규유저")
        assertThat(member.profileImgUrl).isEqualTo("https://example.com/join-or-modify-user.png")
    }
}
