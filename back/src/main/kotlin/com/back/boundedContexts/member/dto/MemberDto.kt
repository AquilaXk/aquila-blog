package com.back.boundedContexts.member.dto

import com.back.boundedContexts.member.domain.shared.Member
import com.fasterxml.jackson.annotation.JsonCreator
import com.fasterxml.jackson.annotation.JsonProperty
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant

data class MemberDto
    @JsonCreator
    constructor(
        val id: Long,
        val createdAt: Instant,
        val modifiedAt: Instant,
        @param:JsonProperty("isAdmin")
        @get:JsonProperty("isAdmin")
        @get:Schema(name = "isAdmin", requiredMode = Schema.RequiredMode.REQUIRED)
        val isAdmin: Boolean,
        val name: String,
        val profileImageUrl: String,
    ) {
        constructor(member: Member) : this(
            id = member.id,
            createdAt = member.createdAt,
            modifiedAt = member.modifiedAt,
            isAdmin = member.isAdmin,
            name = member.name,
            profileImageUrl = member.profileImgUrlVersionedOrDefault,
        )
    }
