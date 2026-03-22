package com.back.global.security.config.oauth2

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("OAuth2ProfileExtractor 테스트")
class OAuth2ProfileExtractorTest {
    @Test
    fun `카카오 properties 필드가 있으면 nickname과 profile image를 그대로 사용한다`() {
        val attributes =
            mapOf(
                "id" to 1234567890L,
                "properties" to
                    mapOf(
                        "nickname" to "카카오닉네임",
                        "profile_image" to "https://kakao.cdn/profile.png",
                    ),
            )

        val payload = OAuth2ProfileExtractor.extractKakao(attributes, fallbackName = "fallback-name")

        assertThat(payload.oauthUserId).isEqualTo("1234567890")
        assertThat(payload.nickname).isEqualTo("카카오닉네임")
        assertThat(payload.profileImgUrl).isEqualTo("https://kakao.cdn/profile.png")
    }

    @Test
    fun `properties가 비어있으면 kakao_account profile 필드로 fallback한다`() {
        val attributes =
            mapOf(
                "id" to "kakao-user-id",
                "kakao_account" to
                    mapOf(
                        "profile" to
                            mapOf(
                                "nickname" to "프로필닉네임",
                                "profile_image_url" to "https://kakao.cdn/profile-image-url.png",
                            ),
                    ),
            )

        val payload = OAuth2ProfileExtractor.extractKakao(attributes, fallbackName = "fallback-name")

        assertThat(payload.oauthUserId).isEqualTo("kakao-user-id")
        assertThat(payload.nickname).isEqualTo("프로필닉네임")
        assertThat(payload.profileImgUrl).isEqualTo("https://kakao.cdn/profile-image-url.png")
    }

    @Test
    fun `nickname 필드가 모두 없으면 기본 닉네임으로 fallback한다`() {
        val attributes = mapOf<String, Any>()

        val payload = OAuth2ProfileExtractor.extractKakao(attributes, fallbackName = "oauth-name-fallback")

        assertThat(payload.oauthUserId).isEqualTo("oauth-name-fallback")
        assertThat(payload.nickname).isEqualTo(OAuth2ProfileExtractor.DEFAULT_KAKAO_NICKNAME)
        assertThat(payload.profileImgUrl).isNull()
    }
}
