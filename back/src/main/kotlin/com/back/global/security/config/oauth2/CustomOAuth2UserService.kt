package com.back.global.security.config.oauth2

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.global.security.domain.SecurityUser
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
    /**
     * 외부 인증/사용자 정보를 로드하고 내부 모델로 매핑합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    @Transactional
    override fun loadUser(userRequest: OAuth2UserRequest): OAuth2User {
        val oAuth2User = super.loadUser(userRequest)
        val provider = OAuth2Provider.from(userRequest.clientRegistration.registrationId)

        val (oauthUserId, nickname, profileImgUrl) =
            when (provider) {
                OAuth2Provider.KAKAO -> {
                    @Suppress("UNCHECKED_CAST")
                    val props = (oAuth2User.attributes.getValue("properties") as Map<String, Any>)

                    Triple(
                        oAuth2User.name,
                        props.getValue("nickname") as String,
                        props.getValue("profile_image") as String,
                    )
                }
            }

        val username = "${provider.name}__$oauthUserId"
        val password = ""

        val member = memberUseCase.modifyOrJoin(username, password, nickname, profileImgUrl).data

        return SecurityUser(
            member.id,
            member.username,
            member.password ?: "",
            member.name,
            member.authorities,
        )
    }
}
