package com.back.boundedContexts.member.application.port.`in`

import com.back.boundedContexts.member.dto.MemberWithUsernameDto

interface CurrentMemberProfileQueryUseCase {
    fun getById(id: Int): MemberWithUsernameDto
}
