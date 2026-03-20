package com.back.boundedContexts.member.dto

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import java.time.Instant

/**
 * `MemberProfileLinkItemDto` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class MemberProfileLinkItemDto(
    val icon: String,
    val label: String,
    val href: String,
) {
    constructor(item: MemberProfileLinkItem) : this(
        icon = item.icon,
        label = item.label,
        href = item.href,
    )
}

/**
 * `MemberWithUsernameDto` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class MemberWithUsernameDto(
    val id: Long,
    val createdAt: Instant,
    val modifiedAt: Instant,
    val isAdmin: Boolean,
    val username: String,
    val name: String,
    val nickname: String,
    val profileImageUrl: String,
    val profileImageDirectUrl: String,
    val profileRole: String,
    val profileBio: String,
    val homeIntroTitle: String,
    val homeIntroDescription: String,
    val serviceLinks: List<MemberProfileLinkItemDto>,
    val contactLinks: List<MemberProfileLinkItemDto>,
) {
    constructor(member: Member) : this(
        id = member.id,
        createdAt = member.createdAt,
        modifiedAt = member.modifiedAt,
        isAdmin = member.isAdmin,
        username = member.username,
        name = member.name,
        nickname = member.nickname,
        profileImageUrl = member.redirectToProfileImgUrlVersionedOrDefault,
        profileImageDirectUrl = member.profileImgUrlVersionedOrDefault,
        profileRole = member.profileRole,
        profileBio = member.profileBio,
        homeIntroTitle = member.homeIntroTitle,
        homeIntroDescription = member.homeIntroDescription,
        serviceLinks = member.serviceLinks.map(::MemberProfileLinkItemDto),
        contactLinks = member.contactLinks.map(::MemberProfileLinkItemDto),
    )
}
