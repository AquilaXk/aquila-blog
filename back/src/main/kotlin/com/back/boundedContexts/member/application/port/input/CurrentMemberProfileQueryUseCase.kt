package com.back.boundedContexts.member.application.port.input

import com.back.boundedContexts.member.dto.MemberProfileWorkspaceResponseDto
import com.back.boundedContexts.member.dto.MemberWithUsernameDto

interface CurrentMemberProfileQueryUseCase {
    fun getById(id: Long): MemberWithUsernameDto

    fun getPublishedById(id: Long): MemberWithUsernameDto

    fun getWorkspaceById(id: Long): MemberProfileWorkspaceResponseDto
}
