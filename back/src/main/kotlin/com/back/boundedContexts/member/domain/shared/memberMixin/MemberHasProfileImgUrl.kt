package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.global.app.AppConfig

const val PROFILE_IMG_URL = "profileImgUrl"
private const val PROFILE_IMG_URL_DEFAULT_VALUE = ""
private const val DEFAULT_SITE_FRONT_URL = "https://www.aquilaxk.site"
private const val DEFAULT_PROFILE_IMAGE_PATH = "/images/default-profile.svg"

fun defaultProfileImageUrl(): String {
    val siteFrontUrl = runCatching { AppConfig.siteFrontUrl.trimEnd('/') }.getOrDefault("")
    val normalizedFrontUrl = siteFrontUrl.ifBlank { DEFAULT_SITE_FRONT_URL }
    return "$normalizedFrontUrl$DEFAULT_PROFILE_IMAGE_PATH"
}

interface MemberHasProfileImgUrl : MemberAware {
    private fun appendProfileImgVersion(url: String): String {
        val version =
            runCatching { getOrInitProfileImgUrlAttr().modifiedAt.toEpochMilli() }.getOrNull()
                ?: runCatching { member.modifiedAt.toEpochMilli() }.getOrNull()
                ?: return url
        val separator = if (url.contains("?")) "&" else "?"
        return "$url${separator}v=$version"
    }

    fun getOrInitProfileImgUrlAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(PROFILE_IMG_URL) {
            loader?.invoke() ?: MemberAttr(0, member, PROFILE_IMG_URL, PROFILE_IMG_URL_DEFAULT_VALUE)
        }

    var profileImgUrl: String
        get() = getOrInitProfileImgUrlAttr().strValue ?: PROFILE_IMG_URL_DEFAULT_VALUE
        set(value) {
            getOrInitProfileImgUrlAttr().strValue = value
        }

    val profileImgUrlOrDefault: String
        get() =
            profileImgUrl.takeIf { it.isNotBlank() }
                ?: defaultProfileImageUrl()

    val profileImgUrlVersionedOrDefault: String
        get() =
            profileImgUrl
                .takeIf { it.isNotBlank() }
                ?.let(::appendProfileImgVersion)
                ?: profileImgUrlOrDefault

    val redirectToProfileImgUrlOrDefault: String
        get() = "${AppConfig.siteBackUrl}/member/api/v1/members/${member.id}/redirectToProfileImg"

    val redirectToProfileImgUrlVersionedOrDefault: String
        get() = appendProfileImgVersion(redirectToProfileImgUrlOrDefault)
}
