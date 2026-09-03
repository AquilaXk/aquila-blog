package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.application.port.input.MemberUseCase.IssuedLoginSession
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import org.springframework.stereotype.Service
import java.util.Optional

@Service
class MemberUseCaseAdapter(
    private val memberApplicationService: MemberApplicationService,
    private val memberLoginSessionIssueService: MemberLoginSessionIssueService,
) : MemberUseCase {
    override fun count(): Long = memberApplicationService.count()

    override fun join(
        username: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
        email: String?,
    ): Member = memberApplicationService.join(username, password, nickname, profileImgUrl, email)

    override fun joinWithVerifiedEmail(
        email: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
    ): Member = memberApplicationService.joinWithVerifiedEmail(email, password, nickname, profileImgUrl)

    override fun findByLoginId(loginId: String): Member? = memberApplicationService.findByLoginId(loginId)

    override fun findByEmail(email: String): Member? = memberApplicationService.findByEmail(email)

    override fun findById(id: Long): Optional<Member> = memberApplicationService.findById(id)

    override fun issueAdminEmailLoginSession(
        email: String,
        nickname: String,
        rememberLoginEnabled: Boolean,
        createdIp: String?,
        userAgent: String?,
    ): IssuedLoginSession =
        memberLoginSessionIssueService.issueAdminEmail(
            email = email,
            nickname = nickname,
            rememberLoginEnabled = rememberLoginEnabled,
            createdIp = createdIp,
            userAgent = userAgent,
        )

    override fun modify(
        member: Member,
        nickname: String,
    ) = memberApplicationService.modify(member, nickname)

    override fun saveProfileWorkspaceDraft(
        member: Member,
        content: MemberProfileWorkspaceContent,
    ) = memberApplicationService.saveProfileWorkspaceDraft(member, content)

    override fun publishProfileWorkspace(member: Member) = memberApplicationService.publishProfileWorkspace(member)
}
