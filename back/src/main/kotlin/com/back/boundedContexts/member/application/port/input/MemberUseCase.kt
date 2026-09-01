package com.back.boundedContexts.member.application.port.input

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import java.util.Optional

interface MemberUseCase {
    fun count(): Long

    fun join(
        username: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
        email: String?,
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

    fun issueAdminEmailLoginSession(
        email: String,
        nickname: String,
        rememberLoginEnabled: Boolean,
        createdIp: String?,
        userAgent: String?,
    ): IssuedLoginSession

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

    data class IssuedLoginSession(
        val member: Member,
        val apiKey: String,
        val accessToken: String,
        val refreshToken: String,
        val sessionKey: String,
        val rememberLoginEnabled: Boolean,
    )
}
