package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.`in`.MemberUseCase
import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.rsData.RsData
import com.back.standard.dto.member.type1.MemberSearchSortType1
import org.springframework.data.domain.Page
import org.springframework.stereotype.Service
import java.util.Optional

@Service
class MemberUseCaseAdapter(
    private val memberApplicationService: MemberApplicationService,
) : MemberUseCase {
    override fun count(): Long = memberApplicationService.count()

    override fun join(
        username: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
        email: String?,
    ): Member = memberApplicationService.join(username, password, nickname, profileImgUrl, email)

    override fun findByUsername(username: String): Member? = memberApplicationService.findByUsername(username)

    override fun findById(id: Int): Optional<Member> = memberApplicationService.findById(id)

    override fun checkPassword(
        member: Member,
        rawPassword: String,
    ) = memberApplicationService.checkPassword(member, rawPassword)

    override fun modify(
        member: Member,
        nickname: String,
        profileImgUrl: String?,
    ) = memberApplicationService.modify(member, nickname, profileImgUrl)

    override fun modifyProfileCard(
        member: Member,
        role: String,
        bio: String,
    ) = memberApplicationService.modifyProfileCard(member, role, bio)

    override fun modifyOrJoin(
        username: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
    ): RsData<Member> = memberApplicationService.modifyOrJoin(username, password, nickname, profileImgUrl)

    override fun findPagedByKw(
        kw: String,
        sort: MemberSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Member> = memberApplicationService.findPagedByKw(kw, sort, page, pageSize)
}
