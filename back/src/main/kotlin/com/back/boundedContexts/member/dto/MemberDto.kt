package com.back.boundedContexts.member.dto

import com.back.boundedContexts.member.domain.shared.Member
import com.fasterxml.jackson.annotation.JsonCreator
import com.fasterxml.jackson.annotation.JsonProperty
import java.time.Instant

/**
 * `MemberDto` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class MemberDto
    @JsonCreator
    constructor(
        val id: Long,
        val createdAt: Instant,
        val modifiedAt: Instant,
        @JsonProperty("isAdmin")
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
            profileImageUrl = member.redirectToProfileImgUrlVersionedOrDefault,
        )
    }
