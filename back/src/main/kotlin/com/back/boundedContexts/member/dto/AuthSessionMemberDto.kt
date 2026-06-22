package com.back.boundedContexts.member.dto

import com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto.LegalReconsentStatus
import com.back.global.security.domain.SecurityUser
import com.fasterxml.jackson.annotation.JsonProperty
import io.swagger.v3.oas.annotations.media.Schema

data class AuthSessionMemberDto(
    val id: Long,
    @get:JsonProperty("isAdmin")
    @field:Schema(name = "isAdmin")
    val isAdmin: Boolean,
    val username: String,
    val nickname: String,
    val legalReconsent: LegalReconsentStatus? = null,
) {
    constructor(
        securityUser: SecurityUser,
        legalReconsent: LegalReconsentStatus? = null,
    ) : this(
        id = securityUser.id,
        isAdmin = securityUser.authorities.any { it.authority == "ROLE_ADMIN" },
        username = securityUser.nickname,
        nickname = securityUser.nickname,
        legalReconsent = legalReconsent,
    )
}
