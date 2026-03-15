package com.back.boundedContexts.post.application.port.output

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.PostWriteRequestIdempotency
import java.time.Instant

interface PostWriteRequestIdempotencyRepositoryPort {
    fun findByActorAndRequestKey(
        actor: Member,
        requestKey: String,
    ): PostWriteRequestIdempotency?

    fun save(idempotency: PostWriteRequestIdempotency): PostWriteRequestIdempotency

    fun saveAndFlush(idempotency: PostWriteRequestIdempotency): PostWriteRequestIdempotency

    fun findExpired(
        cutoff: Instant,
        limit: Int,
    ): List<PostWriteRequestIdempotency>

    fun deleteAll(entries: List<PostWriteRequestIdempotency>)
}
