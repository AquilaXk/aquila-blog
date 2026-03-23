package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.global.rsData.RsData
import com.back.standard.dto.member.type1.MemberSearchSortType1
import com.back.standard.dto.page.PagedResult
import org.springframework.stereotype.Service
import java.util.Optional

/**
 * MemberUseCaseAdapter는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
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

    override fun joinWithVerifiedEmail(
        email: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
    ): Member = memberApplicationService.joinWithVerifiedEmail(email, password, nickname, profileImgUrl)

    override fun findByLoginId(loginId: String): Member? = memberApplicationService.findByLoginId(loginId)

    override fun findByEmail(email: String): Member? = memberApplicationService.findByEmail(email)

    override fun findById(id: Long): Optional<Member> = memberApplicationService.findById(id)

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
        homeIntroTitle: String,
        homeIntroDescription: String,
        serviceLinks: List<MemberProfileLinkItem>,
        contactLinks: List<MemberProfileLinkItem>,
    ) = memberApplicationService.modifyProfileCard(
        member = member,
        role = role,
        bio = bio,
        homeIntroTitle = homeIntroTitle,
        homeIntroDescription = homeIntroDescription,
        serviceLinks = serviceLinks,
        contactLinks = contactLinks,
    )

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
    ): PagedResult<Member> = memberApplicationService.findPagedByKw(kw, sort, page, pageSize)
}
