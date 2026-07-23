package com.back.boundedContexts.member.application.port.input

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.global.rsData.RsData
import com.back.standard.dto.member.type1.MemberSearchSortType1
import com.back.standard.dto.page.PagedResult
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

    fun joinWithVerifiedEmail(
        email: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
    ): Member

    fun findByLoginId(loginId: String): Member?

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
        aboutRole: String?,
        aboutBio: String?,
        aboutDetails: String?,
        blogTitle: String,
        homeIntroTitle: String,
        homeIntroDescription: String,
        blogDesign: String,
        legacyBlogScheme: String,
        serviceLinks: List<MemberProfileLinkItem>,
        contactLinks: List<MemberProfileLinkItem>,
    )

    fun saveProfileWorkspaceDraft(
        member: Member,
        content: MemberProfileWorkspaceContent,
    )

    fun publishProfileWorkspace(member: Member)

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
