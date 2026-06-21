package com.back.global.security.config.oauth2

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.exception.application.AppException
import com.back.global.security.domain.SecurityUser
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.security.authentication.InternalAuthenticationServiceException
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest
import org.springframework.security.oauth2.client.registration.ClientRegistration
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.ClientAuthenticationMethod
import org.springframework.security.oauth2.core.OAuth2AccessToken
import org.springframework.security.oauth2.core.oidc.OidcIdToken
import org.springframework.security.oauth2.core.oidc.OidcScopes
import org.springframework.security.oauth2.core.oidc.OidcUserInfo
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.security.oauth2.core.user.DefaultOAuth2User
import org.springframework.security.oauth2.core.user.OAuth2User
import java.lang.reflect.Proxy
import java.time.Instant

@DisplayName("CustomOAuth2UserService 테스트")
class CustomOAuth2UserServiceTest {
    @Test
    fun `OAuth2 기존 사용자는 내부 SecurityUser로 매핑하고 프로필을 갱신한다`() {
        val memberUseCase = RecordingMemberUseCase(existingMemberUsername = "KAKAO__oauth-user-id")
        val service =
            CustomOAuth2UserService(memberUseCase.proxy).apply {
                delegate =
                    OAuth2UserService<OAuth2UserRequest, OAuth2User> {
                        DefaultOAuth2User(emptyList(), mapOf("id" to "oauth-user-id"), "id")
                    }
            }

        val principal =
            service.loadUser(
                OAuth2UserRequest(kakaoClientRegistration(userNameAttributeName = "id"), accessToken()),
            ) as SecurityUser

        assertThat(memberUseCase.lastFindLoginId).isEqualTo("KAKAO__oauth-user-id")
        assertThat(memberUseCase.lastModifyRequest)
            .isEqualTo(
                ModifyRequest(
                    nickname = OAuth2ProfileExtractor.DEFAULT_KAKAO_NICKNAME,
                    profileImgUrl = null,
                ),
            )
        assertThat(principal.username).isEqualTo("KAKAO__oauth-user-id")
        assertThat(principal.nickname).isEqualTo(OAuth2ProfileExtractor.DEFAULT_KAKAO_NICKNAME)
        assertThat(principal.authorities.map { it.authority }).containsExactly("ROLE_MEMBER")
    }

    @Test
    fun `OIDC claims는 SecurityUser이자 OidcUser인 principal로 매핑한다`() {
        val memberUseCase = RecordingMemberUseCase(existingMemberUsername = "KAKAO__oidc-user-id")
        val idToken =
            OidcIdToken(
                "id-token",
                Instant.EPOCH,
                Instant.EPOCH.plusSeconds(60),
                mapOf(
                    "sub" to "oidc-user-id",
                    "nickname" to "OIDC닉네임",
                    "picture" to "https://kakao.cdn/oidc.png",
                ),
            )
        val userInfo =
            OidcUserInfo(
                mapOf(
                    "sub" to "oidc-user-id",
                    "nickname" to "userinfo-nickname",
                ),
            )
        val service =
            CustomOidcUserService(memberUseCase.proxy).apply {
                delegate =
                    OAuth2UserService<OidcUserRequest, OidcUser> {
                        DefaultOidcUser(emptyList(), idToken, userInfo, "sub")
                    }
            }

        val principal =
            service.loadUser(
                OidcUserRequest(kakaoClientRegistration(userNameAttributeName = "sub"), accessToken(), idToken),
            )
        val securityUser = principal as SecurityUser

        assertThat(memberUseCase.lastFindLoginId).isEqualTo("KAKAO__oidc-user-id")
        assertThat(memberUseCase.lastModifyRequest)
            .isEqualTo(
                ModifyRequest(
                    nickname = "OIDC닉네임",
                    profileImgUrl = "https://kakao.cdn/oidc.png",
                ),
            )
        assertThat(securityUser.username).isEqualTo("KAKAO__oidc-user-id")
        assertThat(securityUser.nickname).isEqualTo("OIDC닉네임")
        assertThat(principal.attributes["sub"]).isEqualTo("oidc-user-id")
        assertThat(principal.claims["nickname"]).isEqualTo("OIDC닉네임")
        assertThat(principal.idToken).isSameAs(idToken)
        assertThat(principal.userInfo.subject).isEqualTo("oidc-user-id")
    }

    @Test
    fun `OAuth2 신규 사용자는 동의 기록이 없으므로 자동 가입하지 않는다`() {
        val service =
            CustomOAuth2UserService(RecordingMemberUseCase().proxy).apply {
                delegate =
                    OAuth2UserService<OAuth2UserRequest, OAuth2User> {
                        DefaultOAuth2User(emptyList(), mapOf("id" to "new-oauth-user-id"), "id")
                    }
            }

        assertThatThrownBy {
            service.loadUser(
                OAuth2UserRequest(kakaoClientRegistration(userNameAttributeName = "id"), accessToken()),
            )
        }.isInstanceOf(InternalAuthenticationServiceException::class.java)
            .cause()
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("소셜 로그인 신규 가입은 현재 지원하지 않습니다.")
    }

    @Test
    fun `지원하지 않는 provider는 명시적으로 거부한다`() {
        val service =
            CustomOAuth2UserService(RecordingMemberUseCase().proxy).apply {
                delegate =
                    OAuth2UserService<OAuth2UserRequest, OAuth2User> {
                        DefaultOAuth2User(emptyList(), mapOf("id" to "oauth-user-id"), "id")
                    }
            }

        assertThatThrownBy {
            service.loadUser(
                OAuth2UserRequest(
                    kakaoClientRegistration(registrationId = "google", userNameAttributeName = "id"),
                    accessToken(),
                ),
            )
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessage("Unsupported provider: google")
    }

    private fun kakaoClientRegistration(
        registrationId: String = "kakao",
        userNameAttributeName: String,
    ): ClientRegistration =
        ClientRegistration
            .withRegistrationId(registrationId)
            .clientId("kakao-client-id")
            .clientSecret("kakao-client-secret")
            .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST)
            .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
            .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
            .scope(OidcScopes.OPENID, "profile_nickname", "profile_image")
            .authorizationUri("https://kauth.kakao.com/oauth/authorize")
            .tokenUri("https://kauth.kakao.com/oauth/token")
            .issuerUri("https://kauth.kakao.com")
            .jwkSetUri("https://kauth.kakao.com/.well-known/jwks.json")
            .userInfoUri("https://kapi.kakao.com/v1/oidc/userinfo")
            .userNameAttributeName(userNameAttributeName)
            .clientName("Kakao")
            .build()

    private fun accessToken(): OAuth2AccessToken =
        OAuth2AccessToken(
            OAuth2AccessToken.TokenType.BEARER,
            "access-token",
            Instant.EPOCH,
            Instant.EPOCH.plusSeconds(60),
        )
}

private data class ModifyRequest(
    val nickname: String,
    val profileImgUrl: String?,
)

private class RecordingMemberUseCase(
    private val existingMemberUsername: String? = null,
) {
    var lastFindLoginId: String? = null
        private set
    var lastModifyRequest: ModifyRequest? = null
        private set
    private var existingMember: Member? =
        existingMemberUsername?.let {
            Member(
                id = 1,
                username = it,
                password = "",
                nickname = "기존닉네임",
            )
        }

    val proxy: MemberUseCase =
        Proxy
            .newProxyInstance(
                MemberUseCase::class.java.classLoader,
                arrayOf(MemberUseCase::class.java),
            ) { _, method, args ->
                when (method.name) {
                    "findByLoginId" -> {
                        val loginId = args?.get(0) as String
                        lastFindLoginId = loginId
                        existingMember?.takeIf { it.username == loginId }
                    }
                    "modify" -> {
                        val request =
                            ModifyRequest(
                                nickname = args?.get(1) as String,
                                profileImgUrl = args[2] as String?,
                            )
                        lastModifyRequest = request
                        existingMember =
                            (args[0] as Member).apply {
                                nickname = request.nickname
                                request.profileImgUrl?.let { profileImgUrl = it }
                            }
                        Unit
                    }
                    "toString" -> "RecordingMemberUseCase"
                    else -> error("Unexpected MemberUseCase method: ${method.name}")
                }
            } as MemberUseCase
}
