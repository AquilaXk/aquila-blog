package com.back.boundedContexts.member.subContexts.notification.dto

data class MemberNotificationStreamPayload(
    val notification: MemberNotificationDto,
    val unreadCount: Int,
)
