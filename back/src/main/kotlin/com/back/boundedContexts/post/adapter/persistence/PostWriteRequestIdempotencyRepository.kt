package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.PostWriteRequestIdempotency
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant

interface PostWriteRequestIdempotencyRepository : JpaRepository<PostWriteRequestIdempotency, Int> {
    fun findByActorAndRequestKey(
        actor: Member,
        requestKey: String,
    ): PostWriteRequestIdempotency?

    fun findByCreatedAtBeforeOrderByCreatedAtAsc(
        cutoff: Instant,
        pageable: Pageable,
    ): List<PostWriteRequestIdempotency>
}
