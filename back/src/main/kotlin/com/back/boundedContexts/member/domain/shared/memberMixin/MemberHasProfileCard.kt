package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.boundedContexts.member.domain.shared.MemberAttr

const val PROFILE_ROLE = "profileRole"
const val PROFILE_BIO = "profileBio"
const val HOME_INTRO_TITLE = "homeIntroTitle"
const val HOME_INTRO_DESCRIPTION = "homeIntroDescription"

private const val PROFILE_ROLE_DEFAULT_VALUE = ""
private const val PROFILE_BIO_DEFAULT_VALUE = ""
private const val HOME_INTRO_TITLE_DEFAULT_VALUE = ""
private const val HOME_INTRO_DESCRIPTION_DEFAULT_VALUE = ""

interface MemberHasProfileCard : MemberAware {
    fun getOrInitProfileRoleAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(PROFILE_ROLE) {
            loader?.invoke() ?: MemberAttr(0, member, PROFILE_ROLE, PROFILE_ROLE_DEFAULT_VALUE)
        }

    fun getOrInitProfileBioAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(PROFILE_BIO) {
            loader?.invoke() ?: MemberAttr(0, member, PROFILE_BIO, PROFILE_BIO_DEFAULT_VALUE)
        }

    fun getOrInitHomeIntroTitleAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(HOME_INTRO_TITLE) {
            loader?.invoke() ?: MemberAttr(0, member, HOME_INTRO_TITLE, HOME_INTRO_TITLE_DEFAULT_VALUE)
        }

    fun getOrInitHomeIntroDescriptionAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(HOME_INTRO_DESCRIPTION) {
            loader?.invoke() ?: MemberAttr(0, member, HOME_INTRO_DESCRIPTION, HOME_INTRO_DESCRIPTION_DEFAULT_VALUE)
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

    var homeIntroTitle: String
        get() = getOrInitHomeIntroTitleAttr().strValue ?: HOME_INTRO_TITLE_DEFAULT_VALUE
        set(value) {
            getOrInitHomeIntroTitleAttr().strValue = value
        }

    var homeIntroDescription: String
        get() = getOrInitHomeIntroDescriptionAttr().strValue ?: HOME_INTRO_DESCRIPTION_DEFAULT_VALUE
        set(value) {
            getOrInitHomeIntroDescriptionAttr().strValue = value
        }
}
