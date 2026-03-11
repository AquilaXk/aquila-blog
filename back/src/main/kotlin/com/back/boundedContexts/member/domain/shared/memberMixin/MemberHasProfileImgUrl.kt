package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.global.app.AppConfig

const val PROFILE_IMG_URL = "profileImgUrl"
private const val PROFILE_IMG_URL_DEFAULT_VALUE = ""

interface MemberHasProfileImgUrl : MemberAware {
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
                ?: "https://placehold.co/600x600?text=U_U"

    val redirectToProfileImgUrlOrDefault: String
        get() = "${AppConfig.siteBackUrl}/member/api/v1/members/${member.id}/redirectToProfileImg"
}
