package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.standard.util.Ut
import java.net.URI
import java.util.Locale

const val PROFILE_ROLE = "profileRole"
const val PROFILE_BIO = "profileBio"
const val ABOUT_ROLE = "aboutRole"
const val ABOUT_BIO = "aboutBio"
const val ABOUT_DETAILS = "aboutDetails"
const val BLOG_TITLE = "blogTitle"
const val HOME_INTRO_TITLE = "homeIntroTitle"
const val HOME_INTRO_DESCRIPTION = "homeIntroDescription"
const val PROFILE_SERVICE_LINKS = "profileServiceLinks"
const val PROFILE_CONTACT_LINKS = "profileContactLinks"

private const val PROFILE_ROLE_DEFAULT_VALUE = ""
private const val PROFILE_BIO_DEFAULT_VALUE = ""
private const val ABOUT_ROLE_DEFAULT_VALUE = ""
private const val ABOUT_BIO_DEFAULT_VALUE = ""
private const val ABOUT_DETAILS_DEFAULT_VALUE = ""
private const val BLOG_TITLE_DEFAULT_VALUE = ""
private const val HOME_INTRO_TITLE_DEFAULT_VALUE = ""
private const val HOME_INTRO_DESCRIPTION_DEFAULT_VALUE = ""
const val PROFILE_SERVICE_LINK_ICON_DEFAULT_VALUE = "service"
const val PROFILE_CONTACT_LINK_ICON_DEFAULT_VALUE = "message"
private const val PROFILE_LINK_LABEL_DEFAULT_VALUE = ""
private const val PROFILE_LINK_HREF_DEFAULT_VALUE = ""
private val PROFILE_LINK_ALLOWED_SCHEMES = setOf("https", "http", "mailto", "tel")

val PROFILE_SERVICE_ICON_ALLOWED =
    setOf(
        "service",
        "briefcase",
        "laptop",
        "rocket",
        "spark",
        "search",
        "tag",
        "camera",
        "question",
    )

val PROFILE_CONTACT_ICON_ALLOWED =
    setOf(
        "github",
        "linkedin",
        "mail",
        "message",
        "kakao",
        "instagram",
        "globe",
        "link",
        "phone",
        "bell",
    )

/**
 * `MemberProfileLinkItem` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class MemberProfileLinkItem(
    val icon: String = PROFILE_SERVICE_LINK_ICON_DEFAULT_VALUE,
    val label: String = PROFILE_LINK_LABEL_DEFAULT_VALUE,
    val href: String = PROFILE_LINK_HREF_DEFAULT_VALUE,
)

/**
 * MemberProfileLinkItemList는 비즈니스 상태와 규칙을 캡슐화하는 도메인 모델입니다.
 * 도메인 불변조건을 지키며 상태 변경을 메서드 단위로 통제합니다.
 */
private data class MemberProfileLinkItemList(
    val items: List<MemberProfileLinkItem> = emptyList(),
)

/**
 * 외부 입력값을 내부 규칙에 맞게 정규화합니다.
 * 도메인 모델 내부에서 불변조건을 지키며 상태 변경을 캡슐화합니다.
 */
fun normalizeProfileLinkHref(rawHref: String): String? {
    val href = rawHref.trim()
    if (href.isBlank()) return ""
    if (href.any { it == '\r' || it == '\n' }) return null

    if (href.startsWith("/")) {
        if (href.startsWith("//")) return null
        return href
    }

    val uri = runCatching { URI(href) }.getOrNull() ?: return null
    val normalizedScheme = uri.scheme?.lowercase(Locale.ROOT) ?: return null
    if (normalizedScheme !in PROFILE_LINK_ALLOWED_SCHEMES) return null

    return href
}

/**
 * 외부 입력값을 내부 규칙에 맞게 정규화합니다.
 * 도메인 모델 내부에서 불변조건을 지키며 상태 변경을 캡슐화합니다.
 */
private fun normalizeProfileLinkItems(
    items: List<MemberProfileLinkItem>,
    defaultIcon: String,
    allowedIcons: Set<String>,
): List<MemberProfileLinkItem> =
    items
        .map { item ->
            MemberProfileLinkItem(
                icon =
                    item.icon
                        .trim()
                        .ifBlank { defaultIcon }
                        .let { icon ->
                            if (icon in allowedIcons) icon else defaultIcon
                        },
                label = item.label.trim(),
                href = normalizeProfileLinkHref(item.href) ?: "",
            )
        }.filter { item ->
            item.label.isNotBlank() && item.href.isNotBlank()
        }

/**
 * decodeProfileLinkItems 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
 * 도메인 계층에서 불변조건을 지키며 상태 전이를 캡슐화합니다.
 */
private fun decodeProfileLinkItems(
    rawValue: String?,
    defaultIcon: String,
    allowedIcons: Set<String>,
): List<MemberProfileLinkItem> {
    if (rawValue.isNullOrBlank()) return emptyList()

    return runCatching {
        Ut.JSON.fromString<MemberProfileLinkItemList>(rawValue).items
    }.getOrElse {
        emptyList()
    }.let { normalizeProfileLinkItems(it, defaultIcon, allowedIcons) }
}

/**
 * encodeProfileLinkItems 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
 * 도메인 계층에서 불변조건을 지키며 상태 전이를 캡슐화합니다.
 */
private fun encodeProfileLinkItems(
    items: List<MemberProfileLinkItem>,
    defaultIcon: String,
    allowedIcons: Set<String>,
): String =
    Ut.JSON.toString(
        MemberProfileLinkItemList(
            normalizeProfileLinkItems(items, defaultIcon, allowedIcons),
        ),
    )

/**
 * `MemberHasProfileCard` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface MemberHasProfileCard : MemberAware {
    fun getOrInitProfileRoleAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(PROFILE_ROLE) {
            loader?.invoke() ?: MemberAttr(0, member, PROFILE_ROLE, PROFILE_ROLE_DEFAULT_VALUE)
        }

    fun getOrInitProfileBioAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(PROFILE_BIO) {
            loader?.invoke() ?: MemberAttr(0, member, PROFILE_BIO, PROFILE_BIO_DEFAULT_VALUE)
        }

    fun getOrInitAboutRoleAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(ABOUT_ROLE) {
            loader?.invoke() ?: MemberAttr(0, member, ABOUT_ROLE, ABOUT_ROLE_DEFAULT_VALUE)
        }

    fun getOrInitAboutBioAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(ABOUT_BIO) {
            loader?.invoke() ?: MemberAttr(0, member, ABOUT_BIO, ABOUT_BIO_DEFAULT_VALUE)
        }

    fun getOrInitAboutDetailsAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(ABOUT_DETAILS) {
            loader?.invoke() ?: MemberAttr(0, member, ABOUT_DETAILS, ABOUT_DETAILS_DEFAULT_VALUE)
        }

    fun getOrInitHomeIntroTitleAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(HOME_INTRO_TITLE) {
            loader?.invoke() ?: MemberAttr(0, member, HOME_INTRO_TITLE, HOME_INTRO_TITLE_DEFAULT_VALUE)
        }

    fun getOrInitBlogTitleAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(BLOG_TITLE) {
            loader?.invoke() ?: MemberAttr(0, member, BLOG_TITLE, BLOG_TITLE_DEFAULT_VALUE)
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

    var aboutRole: String
        get() = getOrInitAboutRoleAttr().strValue ?: ABOUT_ROLE_DEFAULT_VALUE
        set(value) {
            getOrInitAboutRoleAttr().strValue = value
        }

    var aboutBio: String
        get() = getOrInitAboutBioAttr().strValue ?: ABOUT_BIO_DEFAULT_VALUE
        set(value) {
            getOrInitAboutBioAttr().strValue = value
        }

    var aboutDetails: String
        get() = getOrInitAboutDetailsAttr().strValue ?: ABOUT_DETAILS_DEFAULT_VALUE
        set(value) {
            getOrInitAboutDetailsAttr().strValue = value
        }

    var blogTitle: String
        get() = getOrInitBlogTitleAttr().strValue ?: BLOG_TITLE_DEFAULT_VALUE
        set(value) {
            getOrInitBlogTitleAttr().strValue = value
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
        get() =
            decodeProfileLinkItems(
                getOrInitServiceLinksAttr().strValue,
                PROFILE_SERVICE_LINK_ICON_DEFAULT_VALUE,
                PROFILE_SERVICE_ICON_ALLOWED,
            )
        set(value) {
            getOrInitServiceLinksAttr().strValue =
                encodeProfileLinkItems(
                    value,
                    PROFILE_SERVICE_LINK_ICON_DEFAULT_VALUE,
                    PROFILE_SERVICE_ICON_ALLOWED,
                )
        }

    var contactLinks: List<MemberProfileLinkItem>
        get() =
            decodeProfileLinkItems(
                getOrInitContactLinksAttr().strValue,
                PROFILE_CONTACT_LINK_ICON_DEFAULT_VALUE,
                PROFILE_CONTACT_ICON_ALLOWED,
            )
        set(value) {
            getOrInitContactLinksAttr().strValue =
                encodeProfileLinkItems(
                    value,
                    PROFILE_CONTACT_LINK_ICON_DEFAULT_VALUE,
                    PROFILE_CONTACT_ICON_ALLOWED,
                )
        }
}
