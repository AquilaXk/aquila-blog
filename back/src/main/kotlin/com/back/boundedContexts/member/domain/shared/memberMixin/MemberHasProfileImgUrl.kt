package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.global.app.AppConfig

private const val PROFILE_IMG_URL = "profileImgUrl"
private const val PROFILE_IMG_URL_DEFAULT_VALUE = ""

interface MemberHasProfileImgUrl : MemberAware {
    private val profileImgUrlAttr: MemberAttr
        get() = member.getOrPutAttr(PROFILE_IMG_URL) {
            Member.attrRepository.findBySubjectAndName(member, PROFILE_IMG_URL)
                ?: MemberAttr(0, member, PROFILE_IMG_URL, PROFILE_IMG_URL_DEFAULT_VALUE)
        }

    var profileImgUrl: String
        get() = profileImgUrlAttr.strValue ?: PROFILE_IMG_URL_DEFAULT_VALUE
        set(value) {
            profileImgUrlAttr.strValue = value
            Member.attrRepository.save(profileImgUrlAttr)
        }

    val profileImgUrlOrDefault: String
        get() = profileImgUrl.takeIf { it.isNotBlank() }
            ?: "https://placehold.co/600x600?text=U_U"

    val redirectToProfileImgUrlOrDefault: String
        get() = "${AppConfig.siteBackUrl}/member/api/v1/members/${member.id}/redirectToProfileImg"
}
