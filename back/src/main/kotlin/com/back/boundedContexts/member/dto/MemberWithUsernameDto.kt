package com.back.boundedContexts.member.dto

import com.back.boundedContexts.member.domain.shared.Member
import java.time.Instant

data class MemberWithUsernameDto(
    val id: Int,
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
    )
}
