package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.out.MemberAttrRepositoryPort
import com.back.boundedContexts.member.application.port.out.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.exception.app.AppException
import com.back.global.rsData.RsData
import com.back.global.storage.app.UploadedFileRetentionService
import com.back.standard.dto.member.type1.MemberSearchSortType1
import org.springframework.data.domain.PageRequest
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.*

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

        val member = memberRepository.saveAndFlush(Member(0, username, encodedPassword, nickname, normalizedEmail))
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
    fun findById(id: Int): Optional<Member> =
        memberRepository
            .findById(id)
            .map { member ->
                memberProfileHydrator.hydrate(member)
            }

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

    @Transactional
    fun modifyProfileCard(
        member: Member,
        role: String,
        bio: String,
    ) {
        memberProfileHydrator.hydrate(member)
        member.profileRole = role
        member.profileBio = bio
        saveProfileRoleAttr(member)
        saveProfileBioAttr(member)
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

    @Transactional(readOnly = true)
    fun findPagedByKw(
        kw: String,
        sort: MemberSearchSortType1,
        page: Int,
        pageSize: Int,
    ) = memberRepository
        .findQPagedByKw(
            kw,
            PageRequest.of(page - 1, pageSize, sort.sortBy),
        ).map { member ->
            memberProfileHydrator.hydrate(member)
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
}
