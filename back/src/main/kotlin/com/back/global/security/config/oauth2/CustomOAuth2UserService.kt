package com.back.global.security.config.oauth2

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.global.security.domain.SecurityUser
import com.back.global.security.domain.toGrantedAuthorities
import org.slf4j.LoggerFactory
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * OAuth2Provider는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */
private enum class OAuth2Provider {
    KAKAO,
    ;

    companion object {
        fun from(registrationId: String): OAuth2Provider =
            entries.firstOrNull { it.name.equals(registrationId, true) }
                ?: error("Unsupported provider: $registrationId")
    }
}

/**
 * CustomOAuth2UserService는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */

@Service
class CustomOAuth2UserService(
    private val memberUseCase: MemberUseCase,
) : DefaultOAuth2UserService() {
    private val logger = LoggerFactory.getLogger(javaClass)

    /**
     * 외부 인증/사용자 정보를 로드하고 내부 모델로 매핑합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    @Transactional
    override fun loadUser(userRequest: OAuth2UserRequest): OAuth2User {
        val oAuth2User = super.loadUser(userRequest)
        val provider = OAuth2Provider.from(userRequest.clientRegistration.registrationId)

        val profilePayload =
            when (provider) {
                OAuth2Provider.KAKAO -> OAuth2ProfileExtractor.extractKakao(oAuth2User.attributes, oAuth2User.name)
            }

        if (profilePayload.nickname == OAuth2ProfileExtractor.DEFAULT_KAKAO_NICKNAME) {
            logger.warn(
                "oauth2_kakao_profile_fallback_used provider={} oauthUserId={}",
                provider.name.lowercase(),
                profilePayload.oauthUserId,
            )
        }

        val username = "${provider.name}__${profilePayload.oauthUserId}"
        val password = ""

        val member =
            memberUseCase
                .modifyOrJoin(
                    username,
                    password,
                    profilePayload.nickname,
                    profilePayload.profileImgUrl,
                ).data

        return SecurityUser(
            member.id,
            member.username,
            member.password ?: "",
            member.name,
            member.toGrantedAuthorities(),
        )
    }
}

internal data class OAuth2ProfilePayload(
    val oauthUserId: String,
    val nickname: String,
    val profileImgUrl: String?,
)

internal object OAuth2ProfileExtractor {
    const val DEFAULT_KAKAO_NICKNAME: String = "카카오사용자"

    fun extractKakao(
        attributes: Map<String, Any>,
        fallbackName: String,
    ): OAuth2ProfilePayload {
        val properties = attributes["properties"].asMap()
        val kakaoAccount = attributes["kakao_account"].asMap()
        val accountProfile = kakaoAccount?.get("profile").asMap()

        val oauthUserId =
            firstNonBlank(
                attributes["id"],
                fallbackName,
                "unknown",
            )
        val nickname =
            firstNonBlank(
                properties?.get("nickname"),
                accountProfile?.get("nickname"),
                kakaoAccount?.get("name"),
                DEFAULT_KAKAO_NICKNAME,
            )
        val profileImgUrl =
            firstNonBlankOrNull(
                properties?.get("profile_image"),
                accountProfile?.get("profile_image_url"),
                accountProfile?.get("thumbnail_image_url"),
            )

        return OAuth2ProfilePayload(
            oauthUserId = oauthUserId,
            nickname = nickname,
            profileImgUrl = profileImgUrl,
        )
    }

    private fun firstNonBlank(vararg values: Any?): String =
        values
            .asSequence()
            .mapNotNull { it.asNonBlankStringOrNull() }
            .firstOrNull()
            ?: ""

    private fun firstNonBlankOrNull(vararg values: Any?): String? =
        values
            .asSequence()
            .mapNotNull { it.asNonBlankStringOrNull() }
            .firstOrNull()
}

private fun Any?.asMap(): Map<String, Any?>? =
    (this as? Map<*, *>)
        ?.entries
        ?.mapNotNull { (key, value) ->
            (key as? String)?.let { it to value }
        }?.toMap()

private fun Any?.asNonBlankStringOrNull(): String? = this?.toString()?.trim()?.takeIf { it.isNotBlank() }
