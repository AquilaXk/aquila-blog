package com.back.boundedContexts.member.app

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.out.shared.MemberRepository
import com.back.global.exception.app.AppException
import com.back.global.rsData.RsData
import com.back.standard.dto.member.type1.MemberSearchSortType1
import org.springframework.data.domain.PageRequest
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.*

@Service
class MemberFacade(
    private val memberRepository: MemberRepository,
    private val passwordEncoder: PasswordEncoder,
) {
    @Transactional(readOnly = true)
    fun count(): Long = memberRepository.count()

    @Transactional
    fun join(username: String, password: String?, nickname: String, profileImgUrl: String?): Member {
        memberRepository.findByUsername(username)?.let {
            throw AppException("409-1", "이미 존재하는 회원 아이디입니다.")
        }

        val encodedPassword = if (!password.isNullOrBlank())
            passwordEncoder.encode(password)
        else
            null

        val member = memberRepository.save(Member(0, username, encodedPassword, nickname))
        profileImgUrl?.let { member.profileImgUrl = it }

        return member
    }

    @Transactional(readOnly = true)
    fun findByUsername(username: String): Member? = memberRepository.findByUsername(username)

    @Transactional(readOnly = true)
    fun findById(id: Int): Optional<Member> = memberRepository.findById(id)

    @Transactional(readOnly = true)
    fun checkPassword(member: Member, rawPassword: String) {
        val hashed = member.password
        if (!passwordEncoder.matches(rawPassword, hashed))
            throw AppException("401-1", "비밀번호가 일치하지 않습니다.")
    }

    @Transactional
    fun modify(member: Member, nickname: String, profileImgUrl: String?) {
        member.modify(nickname, profileImgUrl)
    }

    @Transactional
    fun modifyOrJoin(username: String, password: String?, nickname: String, profileImgUrl: String?): RsData<Member> =
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
    ) = memberRepository.findQPagedByKw(
        kw,
        PageRequest.of(page - 1, pageSize, sort.sortBy)
    )
}
