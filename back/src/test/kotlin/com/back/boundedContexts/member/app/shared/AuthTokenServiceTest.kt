package com.back.boundedContexts.member.app.shared

import com.back.boundedContexts.member.app.MemberFacade
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AuthTokenServiceTest {
    @Autowired
    private lateinit var memberFacade: MemberFacade

    @Autowired
    private lateinit var authTokenService: AuthTokenService

    @Test
    fun `발급한 액세스 토큰은 다시 payload 로 파싱할 수 있다`() {
        val member = memberFacade.findByUsername("user1")!!

        val accessToken = authTokenService.genAccessToken(member)

        assertThat(accessToken).isNotBlank()
        assertThat(accessToken.split(".")).hasSize(3)
        assertThat(authTokenService.payload(accessToken))
            .isEqualTo(AccessTokenPayload(member.id, member.username, member.name))
    }

    @Test
    fun `형식이 잘못된 액세스 토큰은 payload 파싱 결과가 null 이다`() {
        assertThat(authTokenService.payload("invalid-token")).isNull()
    }
}
