package com.back.global.security.config.oauth2

import com.back.global.security.config.oauth2.application.OAuth2State
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.security.oauth2.client.registration.ClientRegistration
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.ClientAuthenticationMethod
import org.springframework.security.oauth2.core.endpoint.PkceParameterNames
import org.springframework.security.oauth2.core.oidc.OidcScopes
import org.springframework.security.oauth2.core.oidc.endpoint.OidcParameterNames

@DisplayName("CustomOAuth2AuthorizationRequestResolver 테스트")
class OAuth2AuthorizationRequestResolverTest {
    @Test
    fun `카카오 authorization request는 PKCE S256과 OIDC nonce를 포함한다`() {
        val resolver =
            CustomOAuth2AuthorizationRequestResolver(
                InMemoryClientRegistrationRepository(kakaoClientRegistration()),
            )
        val request =
            MockHttpServletRequest("GET", "/oauth2/authorization/kakao").apply {
                scheme = "https"
                serverName = "api.example.com"
                serverPort = 443
                servletPath = "/oauth2/authorization/kakao"
                setParameter("redirectUrl", "/admin")
            }

        val authorizationRequest = resolver.resolve(request)

        assertThat(authorizationRequest).isNotNull
        authorizationRequest!!
        assertThat(authorizationRequest.scopes).containsExactlyInAnyOrder(
            OidcScopes.OPENID,
            "profile_nickname",
            "profile_image",
        )
        assertThat(authorizationRequest.additionalParameters[PkceParameterNames.CODE_CHALLENGE_METHOD])
            .isEqualTo("S256")
        assertThat(authorizationRequest.additionalParameters[PkceParameterNames.CODE_CHALLENGE] as String)
            .isNotBlank()
        assertThat(authorizationRequest.attributes[PkceParameterNames.CODE_VERIFIER] as String)
            .isNotBlank()
        assertThat(authorizationRequest.additionalParameters[OidcParameterNames.NONCE] as String)
            .isNotBlank()
        assertThat(authorizationRequest.attributes[OidcParameterNames.NONCE] as String)
            .isNotBlank()
        assertThat(OAuth2State.decode(authorizationRequest.state).redirectUrl).isEqualTo("/admin")
    }

    private fun kakaoClientRegistration(): ClientRegistration {
        val clientSettings =
            ClientRegistration.ClientSettings
                .builder()
                .requireProofKey(false)
                .build()

        return ClientRegistration
            .withRegistrationId("kakao")
            .clientId("kakao-client-id")
            .clientSecret("kakao-client-secret")
            .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST)
            .clientSettings(clientSettings)
            .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
            .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
            .scope(OidcScopes.OPENID, "profile_nickname", "profile_image")
            .authorizationUri("https://kauth.kakao.com/oauth/authorize")
            .tokenUri("https://kauth.kakao.com/oauth/token")
            .issuerUri("https://kauth.kakao.com")
            .jwkSetUri("https://kauth.kakao.com/.well-known/jwks.json")
            .userInfoUri("https://kapi.kakao.com/v1/oidc/userinfo")
            .userNameAttributeName("sub")
            .clientName("Kakao")
            .build()
    }
}
