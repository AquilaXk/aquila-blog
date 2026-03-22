package com.back.boundedContexts.member.application.port.input

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.global.rsData.RsData
import com.back.standard.dto.member.type1.MemberSearchSortType1
import com.back.standard.dto.page.PagedResult
import java.util.Optional

/**
 * `MemberUseCase` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface MemberUseCase {
    fun count(): Long

    fun join(
        username: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
        email: String? = null,
    ): Member

    fun joinWithVerifiedEmail(
        email: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
    ): Member

    fun findByUsername(username: String): Member?

    fun findByEmail(email: String): Member?

    fun findById(id: Long): Optional<Member>

    fun checkPassword(
        member: Member,
        rawPassword: String,
    )

    fun modify(
        member: Member,
        nickname: String,
        profileImgUrl: String?,
    )

    fun modifyProfileCard(
        member: Member,
        role: String,
        bio: String,
        homeIntroTitle: String,
        homeIntroDescription: String,
        serviceLinks: List<MemberProfileLinkItem>,
        contactLinks: List<MemberProfileLinkItem>,
    )

    fun modifyOrJoin(
        username: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
    ): RsData<Member>

    fun findPagedByKw(
        kw: String,
        sort: MemberSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Member>
}
