package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.standard.dto.member.type1.MemberSearchSortType1
import com.back.standard.dto.page.PagedResult
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.*

/**
 * MemberApplicationService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class MemberApplicationService(
    private val memberRepository: MemberRepositoryPort,
    private val memberAttrRepository: MemberAttrRepositoryPort,
    private val memberProfileHydrator: MemberProfileHydrator,
    private val passwordEncoder: PasswordEncoder,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
) {
    @Transactional(readOnly = true)
    fun count(): Long = memberRepository.count()

    /**
     * 회원 가입 요청을 검증하고 계정을 생성합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    @Transactional
    fun join(
        username: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
        email: String? = null,
    ): Member {
        val normalizedEmail =
            email
                ?.trim()
                ?.lowercase(Locale.ROOT)
                ?.takeIf(String::isNotBlank)

        memberRepository.findByUsername(username)?.let {
            throw AppException("409-1", "이미 존재하는 회원 아이디입니다.")
        }
        normalizedEmail?.let {
            if (memberRepository.existsByEmail(it)) {
                throw AppException("409-2", "이미 사용 중인 이메일입니다.")
            }
        }

        val encodedPassword =
            if (!password.isNullOrBlank()) {
                passwordEncoder.encode(password)
            } else {
                null
            }

        val member =
            try {
                memberRepository.saveAndFlush(Member(0, username, encodedPassword, nickname, normalizedEmail))
            } catch (exception: DataIntegrityViolationException) {
                if (memberRepository.findByUsername(username) != null) {
                    throw AppException("409-1", "이미 존재하는 회원 아이디입니다.")
                }
                normalizedEmail?.let {
                    if (memberRepository.existsByEmail(it)) {
                        throw AppException("409-2", "이미 사용 중인 이메일입니다.")
                    }
                }
                throw AppException("409-3", "동시에 처리된 회원가입 요청입니다. 다시 시도해주세요.")
            }
        memberProfileHydrator.hydrate(member)
        profileImgUrl?.let {
            member.profileImgUrl = it
            saveProfileImgUrlAttr(member)
            uploadedFileRetentionService.syncProfileImage(member.id, null, member.profileImgUrl)
        }

        return member
    }

    @Transactional(readOnly = true)
    fun findByUsername(username: String): Member? =
        memberRepository
            .findByUsername(username)
            ?.let(memberProfileHydrator::hydrate)

    @Transactional(readOnly = true)
    fun findById(id: Long): Optional<Member> =
        memberRepository
            .findById(id)
            .map { member ->
                memberProfileHydrator.hydrate(member)
            }

    /**
     * 검증 규칙을 적용해 허용 여부를 판정합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    @Transactional(readOnly = true)
    fun checkPassword(
        member: Member,
        rawPassword: String,
    ) {
        val hashed = member.password
        if (!passwordEncoder.matches(rawPassword, hashed)) {
            throw AppException("401-1", "비밀번호가 일치하지 않습니다.")
        }
    }

    @Transactional
    fun modify(
        member: Member,
        nickname: String,
        profileImgUrl: String?,
    ) {
        memberProfileHydrator.hydrate(member)
        val previousProfileImgUrl = member.profileImgUrl
        member.modify(nickname, profileImgUrl)
        if (profileImgUrl != null) {
            saveProfileImgUrlAttr(member)
            uploadedFileRetentionService.syncProfileImage(member.id, previousProfileImgUrl, member.profileImgUrl)
        }
    }

    /**
     * 수정 요청을 처리하고 낙관적 잠금/후속 동기화를 수행합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    @Transactional
    fun modifyProfileCard(
        member: Member,
        role: String,
        bio: String,
        homeIntroTitle: String,
        homeIntroDescription: String,
        serviceLinks: List<MemberProfileLinkItem>,
        contactLinks: List<MemberProfileLinkItem>,
    ) {
        memberProfileHydrator.hydrate(member)
        member.profileRole = role
        member.profileBio = bio
        member.homeIntroTitle = homeIntroTitle
        member.homeIntroDescription = homeIntroDescription
        member.serviceLinks = serviceLinks
        member.contactLinks = contactLinks
        saveProfileRoleAttr(member)
        saveProfileBioAttr(member)
        saveHomeIntroTitleAttr(member)
        saveHomeIntroDescriptionAttr(member)
        saveServiceLinksAttr(member)
        saveContactLinksAttr(member)
    }

    @Transactional
    fun modifyOrJoin(
        username: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
    ): RsData<Member> =
        findByUsername(username)
            ?.let {
                modify(it, nickname, profileImgUrl)
                RsData("200-1", "회원 정보가 수정되었습니다.", it)
            }
            ?: run {
                val joinedMember = join(username, password, nickname, profileImgUrl)
                RsData("201-1", "회원가입이 완료되었습니다.", joinedMember)
            }

    /**
     * 검색/목록 조회 조건을 정규화해 페이징 결과를 구성합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    @Transactional(readOnly = true)
    fun findPagedByKw(
        kw: String,
        sort: MemberSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Member> {
        val safeZeroBasedPage = normalizeZeroBasedPage(page)
        val safePageSize = normalizePageSize(pageSize)
        val query =
            MemberRepositoryPort.PagedQuery(
                kw = kw,
                zeroBasedPage = safeZeroBasedPage,
                pageSize = safePageSize,
                sortProperty = sort.property,
                sortAscending = sort.isAsc,
            )
        val memberPage = memberRepository.findQPagedByKw(query)
        memberProfileHydrator.hydrateAll(memberPage.content)

        return PagedResult(
            memberPage.content,
            safeZeroBasedPage + 1,
            safePageSize,
            memberPage.totalElements,
        )
    }

    /**
     * 외부 입력값을 내부 규칙에 맞게 정규화합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun normalizeZeroBasedPage(page: Int): Int {
        if (page < 1) {
            throw AppException("400-1", "page는 1 이상이어야 합니다.")
        }

        // page >= 1 일 때만 변환하여 underflow 가능성을 제거한다.
        return if (page == 1) 0 else page - 1
    }

    /**
     * 외부 입력값을 내부 규칙에 맞게 정규화합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun normalizePageSize(pageSize: Int): Int {
        if (pageSize !in 1..30) {
            throw AppException("400-1", "pageSize는 1~30 범위여야 합니다.")
        }

        return pageSize
    }

    private fun saveProfileImgUrlAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitProfileImgUrlAttr())
    }

    private fun saveProfileRoleAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitProfileRoleAttr())
    }

    private fun saveProfileBioAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitProfileBioAttr())
    }

    private fun saveHomeIntroTitleAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitHomeIntroTitleAttr())
    }

    private fun saveHomeIntroDescriptionAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitHomeIntroDescriptionAttr())
    }

    private fun saveServiceLinksAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitServiceLinksAttr())
    }

    private fun saveContactLinksAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitContactLinksAttr())
    }
}
