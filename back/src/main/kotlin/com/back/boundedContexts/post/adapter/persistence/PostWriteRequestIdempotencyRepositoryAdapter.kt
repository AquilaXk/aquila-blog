package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostWriteRequestIdempotencyRepositoryPort
import com.back.boundedContexts.post.domain.PostWriteRequestIdempotency
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class PostWriteRequestIdempotencyRepositoryAdapter(
    private val postWriteRequestIdempotencyRepository: PostWriteRequestIdempotencyRepository,
) : PostWriteRequestIdempotencyRepositoryPort {
    override fun findByActorAndRequestKey(
        actor: Member,
        requestKey: String,
    ): PostWriteRequestIdempotency? = postWriteRequestIdempotencyRepository.findByActorAndRequestKey(actor, requestKey)

    override fun save(idempotency: PostWriteRequestIdempotency): PostWriteRequestIdempotency =
        postWriteRequestIdempotencyRepository.save(idempotency)

    override fun saveAndFlush(idempotency: PostWriteRequestIdempotency): PostWriteRequestIdempotency =
        postWriteRequestIdempotencyRepository.saveAndFlush(idempotency)

    override fun findExpired(
        cutoff: Instant,
        limit: Int,
    ): List<PostWriteRequestIdempotency> =
        postWriteRequestIdempotencyRepository.findByCreatedAtBeforeOrderByCreatedAtAsc(
            cutoff,
            PageRequest.of(0, limit.coerceIn(1, 1_000)),
        )

    override fun deleteAll(entries: List<PostWriteRequestIdempotency>) {
        if (entries.isEmpty()) return
        postWriteRequestIdempotencyRepository.deleteAllInBatch(entries)
    }
}
