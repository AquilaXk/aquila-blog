package com.back.boundedContexts.member.application.event

data class MemberPublicProfileChangedEvent(
    val memberId: Long,
    val previousNickname: String,
    val currentNickname: String,
    val previousProfileImgUrl: String,
    val currentProfileImgUrl: String,
)
