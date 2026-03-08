package com.back.boundedContexts.member.app.shared

import com.back.boundedContexts.member.domain.shared.MemberProxy
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.global.security.domain.SecurityUser
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.test.context.ActiveProfiles
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ActorFacadeTest {
    @Autowired
    private lateinit var actorFacade: ActorFacade

    @Test
    fun `username 으로 회원을 조회할 수 있다`() {
        val member = actorFacade.findByUsername("user1")

        assertThat(member).isNotNull
        assertThat(member!!.username).isEqualTo("user1")
        assertThat(member.nickname).isEqualTo("유저1")
    }

    @Test
    fun `apiKey 로 회원을 조회할 수 있다`() {
        val user1 = actorFacade.findByUsername("user1")!!

        val member = actorFacade.findByApiKey(user1.apiKey)

        assertThat(member).isNotNull
        assertThat(member!!.id).isEqualTo(user1.id)
        assertThat(member.username).isEqualTo(user1.username)
    }

    @Test
    fun `회원으로 accessToken 을 발급하고 payload 를 다시 파싱할 수 있다`() {
        val user1 = actorFacade.findByUsername("user1")!!

        val accessToken = actorFacade.genAccessToken(user1)

        assertThat(accessToken).isNotBlank
        assertThat(actorFacade.payload(accessToken))
            .isEqualTo(AccessTokenPayload(user1.id, user1.username, user1.name))
    }

    @Test
    fun `id 로 회원을 조회할 수 있다`() {
        val user1 = actorFacade.findByUsername("user1")!!

        val member = actorFacade.findById(user1.id)

        assertThat(member).isNotNull
        assertThat(member!!.username).isEqualTo("user1")
    }

    @Test
    fun `id 로 회원 reference 를 가져올 수 있다`() {
        val user1 = actorFacade.findByUsername("user1")!!

        val reference = actorFacade.getReferenceById(user1.id)

        assertThat(reference.id).isEqualTo(user1.id)
    }

    @Test
    fun `SecurityUser 로부터 회원을 조회할 수 있다`() {
        val user1 = actorFacade.findByUsername("user1")!!
        val securityUser = SecurityUser(
            user1.id,
            user1.username,
            user1.password ?: "",
            user1.nickname,
            listOf(SimpleGrantedAuthority("ROLE_USER")),
        )

        val member = actorFacade.memberOf(securityUser)

        assertThat(member).isInstanceOf(MemberProxy::class.java)
        assertThat(member.id).isEqualTo(user1.id)
        assertThat(member.username).isEqualTo(user1.username)
        assertThat(member.nickname).isEqualTo(user1.nickname)
    }

    @Test
    fun `MemberProxy 에서 nickname 과 profileImgUrl 을 수정하면 실제 회원에도 반영된다`() {
        val user1 = actorFacade.findByUsername("user1")!!

        val securityUser = SecurityUser(
            user1.id,
            user1.username,
            user1.password ?: "",
            user1.nickname,
            listOf(SimpleGrantedAuthority("ROLE_USER")),
        )

        val member = actorFacade.memberOf(securityUser)

        member.nickname = "프록시유저1"
        member.profileImgUrl = "https://example.com/proxy-user1.png"

        assertThat(user1.nickname).isEqualTo("프록시유저1")
        assertThat(user1.profileImgUrl).isEqualTo("https://example.com/proxy-user1.png")
        assertThat(member.profileImgUrlOrDefault).isEqualTo("https://example.com/proxy-user1.png")
    }
}
