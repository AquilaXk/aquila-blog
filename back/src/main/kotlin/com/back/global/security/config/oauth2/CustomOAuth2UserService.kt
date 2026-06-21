package com.back.global.security.config.oauth2

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.oauthSignup.application.port.input.OAuthSignupUseCase
import com.back.global.security.domain.SecurityUser
import com.back.global.security.domain.toGrantedAuthorities
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import org.springframework.security.authentication.InternalAuthenticationServiceException
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.core.oidc.OidcIdToken
import org.springframework.security.oauth2.core.oidc.OidcUserInfo
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

private enum class OAuth2Provider {
    KAKAO,
    ;

    companion object {
        fun from(registrationId: String): OAuth2Provider =
            entries.firstOrNull { it.name.equals(registrationId, true) }
                ?: error("Unsupported provider: $registrationId")
    }
}

@Service
class CustomOAuth2UserService(
    private val memberUseCase: MemberUseCase,
    private val oauthSignupUseCase: OAuthSignupUseCase,
) : OAuth2UserService<OAuth2UserRequest, OAuth2User> {
    internal var delegate: OAuth2UserService<OAuth2UserRequest, OAuth2User> = DefaultOAuth2UserService()
    private val logger = LoggerFactory.getLogger(javaClass)

    @Transactional
    override fun loadUser(userRequest: OAuth2UserRequest): OAuth2User {
        val oAuth2User = delegate.loadUser(userRequest)
        val provider = OAuth2Provider.from(userRequest.clientRegistration.registrationId)
        val profilePayload =
            when (provider) {
                OAuth2Provider.KAKAO -> OAuth2ProfileExtractor.extractKakao(oAuth2User.attributes, oAuth2User.name)
            }

        return loadExistingMemberOrStartSignup(
            provider = provider,
            profilePayload = profilePayload,
            memberUseCase = memberUseCase,
            oauthSignupUseCase = oauthSignupUseCase,
            logger = logger,
        ).toSecurityUser()
    }
}

@Service
class CustomOidcUserService(
    private val memberUseCase: MemberUseCase,
    private val oauthSignupUseCase: OAuthSignupUseCase,
) : OAuth2UserService<OidcUserRequest, OidcUser> {
    internal var delegate: OAuth2UserService<OidcUserRequest, OidcUser> = OidcUserService()
    private val logger = LoggerFactory.getLogger(javaClass)

    @Transactional
    override fun loadUser(userRequest: OidcUserRequest): OidcUser {
        val oidcUser = delegate.loadUser(userRequest)
        val provider = OAuth2Provider.from(userRequest.clientRegistration.registrationId)
        val profilePayload =
            when (provider) {
                OAuth2Provider.KAKAO -> OAuth2ProfileExtractor.extractKakao(oidcUser.claims, oidcUser.name)
            }
        val member =
            loadExistingMemberOrStartSignup(
                provider = provider,
                profilePayload = profilePayload,
                memberUseCase = memberUseCase,
                oauthSignupUseCase = oauthSignupUseCase,
                logger = logger,
            )

        return member.toSecurityOidcUser(oidcUser)
    }
}

private fun loadExistingMemberOrStartSignup(
    provider: OAuth2Provider,
    profilePayload: OAuth2ProfilePayload,
    memberUseCase: MemberUseCase,
    oauthSignupUseCase: OAuthSignupUseCase,
    logger: Logger,
): Member {
    val providerSubjectHash =
        oauthSignupUseCase.providerSubjectHash(
            provider = provider.name,
            providerSubject = profilePayload.oauthUserId,
        )
    if (profilePayload.nickname == OAuth2ProfileExtractor.DEFAULT_KAKAO_NICKNAME) {
        logger.warn(
            "oauth2_kakao_profile_fallback_used provider={} providerSubjectHash={}",
            provider.name.lowercase(),
            providerSubjectHash,
        )
    }

    val memberLoginId =
        oauthSignupUseCase.memberLoginId(
            provider = provider.name,
            providerSubjectHash = providerSubjectHash,
        )
    val legacyLoginId = "${provider.name}__${profilePayload.oauthUserId}"

    val member =
        memberUseCase.findByLoginId(memberLoginId)
            ?: memberUseCase.findByLoginId(legacyLoginId)

    if (member == null) {
        throw buildPendingSignupException(provider, profilePayload, oauthSignupUseCase)
    }

    memberUseCase.modify(member, profilePayload.nickname, profilePayload.profileImgUrl)

    return member
}

private fun buildPendingSignupException(
    provider: OAuth2Provider,
    profilePayload: OAuth2ProfilePayload,
    oauthSignupUseCase: OAuthSignupUseCase,
): OAuthSignupRequiredAuthenticationException {
    val pending =
        oauthSignupUseCase.startPending(
            provider = provider.name,
            providerSubject = profilePayload.oauthUserId,
            nickname = profilePayload.nickname,
            profileImgUrl = profilePayload.profileImgUrl,
        )

    return OAuthSignupRequiredAuthenticationException(
        provider = pending.provider,
        pendingToken = pending.pendingToken,
        expiresAt = pending.expiresAt,
    )
}

internal class OAuthSignupRequiredAuthenticationException(
    val provider: String,
    val pendingToken: String,
    val expiresAt: Instant,
) : InternalAuthenticationServiceException("OAuth signup requires local consent.")

private fun Member.toSecurityUser(): SecurityUser =
    SecurityUser(
        id,
        username,
        password ?: "",
        name,
        toGrantedAuthorities(),
    )

private fun Member.toSecurityOidcUser(oidcUser: OidcUser): SecurityOidcUser =
    SecurityOidcUser(
        id,
        username,
        password ?: "",
        name,
        toGrantedAuthorities(),
        oidcUser.idToken,
        oidcUser.userInfo,
    )

private class SecurityOidcUser(
    id: Long,
    username: String,
    password: String,
    nickname: String,
    authorities: Collection<GrantedAuthority>,
    private val idToken: OidcIdToken,
    userInfo: OidcUserInfo?,
) : SecurityUser(id, username, password, nickname, authorities),
    OidcUser {
    private val userInfo = userInfo ?: OidcUserInfo(idToken.claims)
    private val oidcClaims: Map<String, Any> =
        buildMap {
            putAll(this@SecurityOidcUser.userInfo.claims)
            putAll(idToken.claims)
        }

    override fun getAttributes(): Map<String, Any> = oidcClaims

    override fun getClaims(): Map<String, Any> = oidcClaims

    override fun getUserInfo(): OidcUserInfo = userInfo

    override fun getIdToken(): OidcIdToken = idToken
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
                attributes["sub"],
                fallbackName,
                "unknown",
            )
        val nickname =
            firstNonBlank(
                properties?.get("nickname"),
                accountProfile?.get("nickname"),
                kakaoAccount?.get("name"),
                attributes["nickname"],
                attributes["name"],
                DEFAULT_KAKAO_NICKNAME,
            )
        val profileImgUrl =
            firstNonBlankOrNull(
                properties?.get("profile_image"),
                accountProfile?.get("profile_image_url"),
                accountProfile?.get("thumbnail_image_url"),
                attributes["picture"],
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
