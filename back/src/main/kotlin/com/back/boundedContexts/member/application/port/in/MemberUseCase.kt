package com.back.boundedContexts.member.application.port.`in`

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.rsData.RsData
import com.back.standard.dto.member.type1.MemberSearchSortType1
import org.springframework.data.domain.Page
import java.util.Optional

interface MemberUseCase {
    fun count(): Long

    fun join(
        username: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
        email: String? = null,
    ): Member

    fun findByUsername(username: String): Member?

    fun findById(id: Int): Optional<Member>

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
    ): Page<Member>
}
