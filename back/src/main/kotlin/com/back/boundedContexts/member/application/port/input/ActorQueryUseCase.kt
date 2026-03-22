package com.back.boundedContexts.member.application.port.input

import com.back.boundedContexts.member.domain.shared.Member

interface ActorQueryUseCase {
    fun findByUsername(username: String): Member?

    fun findByEmail(email: String): Member?
}
