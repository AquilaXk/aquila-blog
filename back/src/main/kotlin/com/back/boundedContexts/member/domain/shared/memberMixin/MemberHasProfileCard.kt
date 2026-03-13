package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.standard.util.Ut

const val PROFILE_ROLE = "profileRole"
const val PROFILE_BIO = "profileBio"
const val HOME_INTRO_TITLE = "homeIntroTitle"
const val HOME_INTRO_DESCRIPTION = "homeIntroDescription"
const val PROFILE_SERVICE_LINKS = "profileServiceLinks"
const val PROFILE_CONTACT_LINKS = "profileContactLinks"

private const val PROFILE_ROLE_DEFAULT_VALUE = ""
private const val PROFILE_BIO_DEFAULT_VALUE = ""
private const val HOME_INTRO_TITLE_DEFAULT_VALUE = ""
private const val HOME_INTRO_DESCRIPTION_DEFAULT_VALUE = ""
private const val PROFILE_LINK_ICON_DEFAULT_VALUE = "service"
private const val PROFILE_LINK_LABEL_DEFAULT_VALUE = ""
private const val PROFILE_LINK_HREF_DEFAULT_VALUE = ""

data class MemberProfileLinkItem(
    val icon: String = PROFILE_LINK_ICON_DEFAULT_VALUE,
    val label: String = PROFILE_LINK_LABEL_DEFAULT_VALUE,
    val href: String = PROFILE_LINK_HREF_DEFAULT_VALUE,
)

private data class MemberProfileLinkItemList(
    val items: List<MemberProfileLinkItem> = emptyList(),
)

private fun normalizeProfileLinkItems(items: List<MemberProfileLinkItem>): List<MemberProfileLinkItem> =
    items
        .map { item ->
            MemberProfileLinkItem(
                icon = item.icon.trim().ifBlank { PROFILE_LINK_ICON_DEFAULT_VALUE },
                label = item.label.trim(),
                href = item.href.trim(),
            )
        }.filter { item ->
            item.label.isNotBlank() && item.href.isNotBlank()
        }

private fun decodeProfileLinkItems(rawValue: String?): List<MemberProfileLinkItem> {
    if (rawValue.isNullOrBlank()) return emptyList()

    return runCatching {
        Ut.JSON.fromString<MemberProfileLinkItemList>(rawValue).items
    }.getOrElse {
        emptyList()
    }.let(::normalizeProfileLinkItems)
}

private fun encodeProfileLinkItems(items: List<MemberProfileLinkItem>): String =
    Ut.JSON.toString(
        MemberProfileLinkItemList(
            normalizeProfileLinkItems(items),
        ),
    )

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

    fun getOrInitServiceLinksAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(PROFILE_SERVICE_LINKS) {
            loader?.invoke() ?: MemberAttr(0, member, PROFILE_SERVICE_LINKS, "")
        }

    fun getOrInitContactLinksAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(PROFILE_CONTACT_LINKS) {
            loader?.invoke() ?: MemberAttr(0, member, PROFILE_CONTACT_LINKS, "")
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

    var serviceLinks: List<MemberProfileLinkItem>
        get() = decodeProfileLinkItems(getOrInitServiceLinksAttr().strValue)
        set(value) {
            getOrInitServiceLinksAttr().strValue = encodeProfileLinkItems(value)
        }

    var contactLinks: List<MemberProfileLinkItem>
        get() = decodeProfileLinkItems(getOrInitContactLinksAttr().strValue)
        set(value) {
            getOrInitContactLinksAttr().strValue = encodeProfileLinkItems(value)
        }
}
