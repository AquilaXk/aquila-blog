package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberProxy
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.global.security.domain.SecurityUser
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.security.core.authority.SimpleGrantedAuthority
import java.util.Optional

@org.junit.jupiter.api.DisplayName("ActorApplicationService 테스트")
class ActorApplicationServiceTest {
    private lateinit var user1: Member
    private lateinit var actorApplicationService: ActorApplicationService

    @BeforeEach
    fun setUp() {
        user1 =
            Member(
                id = 1,
                username = "user1",
                password = "1234",
                nickname = "유저1",
                email = "user1@example.com",
                apiKey = "api-key-user1",
            )
        actorApplicationService =
            ActorApplicationService(
                authTokenService = AuthTokenService("12345678901234567890123456789012", 3600),
                memberRepository = FakeMemberRepository(user1),
            )
    }

    @Test
    fun `username 으로 회원을 조회할 수 있다`() {
        val member = actorApplicationService.findByUsername("user1")

        assertThat(member).isNotNull
        assertThat(member!!.username).isEqualTo("user1")
        assertThat(member.nickname).isEqualTo("유저1")
    }

    @Test
    fun `apiKey 로 회원을 조회할 수 있다`() {
        val member = actorApplicationService.findByApiKey(user1.apiKey)

        assertThat(member).isNotNull
        assertThat(member!!.id).isEqualTo(user1.id)
        assertThat(member.username).isEqualTo(user1.username)
    }

    @Test
    fun `회원으로 accessToken 을 발급하고 payload 를 다시 파싱할 수 있다`() {
        val accessToken = actorApplicationService.genAccessToken(user1)

        assertThat(accessToken).isNotBlank
        assertThat(actorApplicationService.payload(accessToken))
            .isEqualTo(AccessTokenPayload(user1.id, user1.username, user1.name))
    }

    @Test
    fun `id 로 회원을 조회할 수 있다`() {
        val member = actorApplicationService.findById(user1.id)

        assertThat(member).isNotNull
        assertThat(member!!.username).isEqualTo("user1")
    }

    @Test
    fun `id 로 회원 reference 를 가져올 수 있다`() {
        val reference = actorApplicationService.getReferenceById(user1.id)

        assertThat(reference.id).isEqualTo(user1.id)
    }

    @Test
    fun `SecurityUser 로부터 회원을 조회할 수 있다`() {
        val securityUser =
            SecurityUser(
                user1.id,
                user1.username,
                user1.password ?: "",
                user1.nickname,
                listOf(SimpleGrantedAuthority("ROLE_USER")),
            )

        val member = actorApplicationService.memberOf(securityUser)

        assertThat(member).isInstanceOf(MemberProxy::class.java)
        assertThat(member.id).isEqualTo(user1.id)
        assertThat(member.username).isEqualTo(user1.username)
        assertThat(member.nickname).isEqualTo(user1.nickname)
    }

    @Test
    fun `MemberProxy 에서 nickname 과 profileImgUrl 을 수정하면 실제 회원에도 반영된다`() {
        val securityUser =
            SecurityUser(
                user1.id,
                user1.username,
                user1.password ?: "",
                user1.nickname,
                listOf(SimpleGrantedAuthority("ROLE_USER")),
            )

        val member = actorApplicationService.memberOf(securityUser)

        member.nickname = "프록시유저1"
        member.profileImgUrl = "https://example.com/proxy-user1.png"

        assertThat(user1.nickname).isEqualTo("프록시유저1")
        assertThat(user1.profileImgUrl).isEqualTo("https://example.com/proxy-user1.png")
        assertThat(member.profileImgUrlOrDefault).isEqualTo("https://example.com/proxy-user1.png")
    }

    private class FakeMemberRepository(
        private val member: Member,
    ) : MemberRepositoryPort {
        override fun count(): Long = 1

        override fun save(member: Member): Member = member

        override fun saveAndFlush(member: Member): Member = member

        override fun existsByEmail(email: String): Boolean = member.email == email

        override fun findByUsername(username: String): Member? = member.takeIf { it.username == username }

        override fun findByEmail(email: String): Member? = member.takeIf { it.email == email }

        override fun findByApiKey(apiKey: String): Member? = member.takeIf { it.apiKey == apiKey }

        override fun findById(id: Long): Optional<Member> = Optional.ofNullable(member.takeIf { it.id == id })

        override fun getReferenceById(id: Long): Member = member.takeIf { it.id == id } ?: error("member not found")

        override fun findQPagedByKw(query: MemberRepositoryPort.PagedQuery): MemberRepositoryPort.PagedResult<Member> =
            error("not used in this test")
    }
}
