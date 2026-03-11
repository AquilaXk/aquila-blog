package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr

const val PROFILE_ROLE = "profileRole"
const val PROFILE_BIO = "profileBio"

private const val PROFILE_ROLE_DEFAULT_VALUE = ""
private const val PROFILE_BIO_DEFAULT_VALUE = ""

interface MemberHasProfileCard : MemberAware {
    fun getOrInitProfileRoleAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(PROFILE_ROLE) {
            loader?.invoke() ?: MemberAttr(0, member, PROFILE_ROLE, PROFILE_ROLE_DEFAULT_VALUE)
        }

    fun getOrInitProfileBioAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(PROFILE_BIO) {
            loader?.invoke() ?: MemberAttr(0, member, PROFILE_BIO, PROFILE_BIO_DEFAULT_VALUE)
        }

    var profileRole: String
        get() = getOrInitProfileRoleAttr().strValue ?: PROFILE_ROLE_DEFAULT_VALUE
        set(value) {
            getOrInitProfileRoleAttr().strValue = value
        }

    var profileBio: String
        get() = getOrInitProfileBioAttr().strValue ?: PROFILE_BIO_DEFAULT_VALUE
        set(value) {
            getOrInitProfileBioAttr().strValue = value
        }
}
