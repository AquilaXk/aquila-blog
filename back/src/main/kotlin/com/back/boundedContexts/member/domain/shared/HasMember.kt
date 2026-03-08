package com.back.boundedContexts.member.domain.shared

interface HasMember {
    val id: Int
    val name: String
    val member: Member
}
