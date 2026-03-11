package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.out.MemberAttrRepositoryPort
import com.back.boundedContexts.member.application.port.out.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_BIO
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_ROLE
import com.back.global.exception.app.AppException
import com.back.global.rsData.RsData
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
    private val passwordEncoder: PasswordEncoder,
) {
    @Transactional(readOnly = true)
    fun count(): Long = memberRepository.count()

    @Transactional
    fun join(
        username: String,
        password: String?,
        nickname: String,
        profileImgUrl: String?,
    ): Member {
        memberRepository.findByUsername(username)?.let {
            throw AppException("409-1", "이미 존재하는 회원 아이디입니다.")
        }

        val encodedPassword =
            if (!password.isNullOrBlank()) {
                passwordEncoder.encode(password)
            } else {
                null
            }

        val member = memberRepository.saveAndFlush(Member(0, username, encodedPassword, nickname))
        profileImgUrl?.let {
            hydrateProfileAttrs(member)
            member.profileImgUrl = it
            saveProfileImgUrlAttr(member)
        }

        return member
    }

    @Transactional(readOnly = true)
    fun findByUsername(username: String): Member? =
        memberRepository
            .findByUsername(username)
            ?.also(::hydrateProfileAttrs)

    @Transactional(readOnly = true)
    fun findById(id: Int): Optional<Member> =
        memberRepository
            .findById(id)
            .map { member ->
                hydrateProfileAttrs(member)
                member
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
        hydrateProfileAttrs(member)
        member.modify(nickname, profileImgUrl)
        if (profileImgUrl != null) saveProfileImgUrlAttr(member)
    }

    @Transactional
    fun modifyProfileCard(
        member: Member,
        role: String,
        bio: String,
    ) {
        hydrateProfileAttrs(member)
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
            hydrateProfileAttrs(member)
            member
        }

    private fun hydrateProfileAttrs(member: Member) {
        member.getOrInitProfileImgUrlAttr {
            memberAttrRepository.findBySubjectAndName(member, PROFILE_IMG_URL)
                ?: MemberAttr(0, member, PROFILE_IMG_URL, "")
        }
        member.getOrInitProfileRoleAttr {
            memberAttrRepository.findBySubjectAndName(member, PROFILE_ROLE)
                ?: MemberAttr(0, member, PROFILE_ROLE, "")
        }
        member.getOrInitProfileBioAttr {
            memberAttrRepository.findBySubjectAndName(member, PROFILE_BIO)
                ?: MemberAttr(0, member, PROFILE_BIO, "")
        }
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
