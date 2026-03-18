package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.global.app.AppConfig

const val PROFILE_IMG_URL = "profileImgUrl"
private const val PROFILE_IMG_URL_DEFAULT_VALUE = ""

/**
 * `MemberHasProfileImgUrl` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface MemberHasProfileImgUrl : MemberAware {
    /**
     * appendProfileImgVersion 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 도메인 계층에서 불변조건을 지키며 상태 전이를 캡슐화합니다.
     */
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
                ?: "https://placehold.co/600x600?text=U_U"

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
