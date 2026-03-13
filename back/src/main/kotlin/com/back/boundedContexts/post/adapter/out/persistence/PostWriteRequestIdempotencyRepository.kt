package com.back.boundedContexts.post.adapter.out.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.PostWriteRequestIdempotency
import org.springframework.data.jpa.repository.JpaRepository

interface PostWriteRequestIdempotencyRepository : JpaRepository<PostWriteRequestIdempotency, Int> {
    fun findByActorAndRequestKey(
        actor: Member,
        requestKey: String,
    ): PostWriteRequestIdempotency?
}
