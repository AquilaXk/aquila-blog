package com.back.boundedContexts.post.application.port.out

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.PostWriteRequestIdempotency

interface PostWriteRequestIdempotencyRepositoryPort {
    fun findByActorAndRequestKey(
        actor: Member,
        requestKey: String,
    ): PostWriteRequestIdempotency?

    fun save(idempotency: PostWriteRequestIdempotency): PostWriteRequestIdempotency

    fun saveAndFlush(idempotency: PostWriteRequestIdempotency): PostWriteRequestIdempotency
}
