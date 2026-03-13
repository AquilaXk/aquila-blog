package com.back.boundedContexts.post.adapter.out.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.out.PostWriteRequestIdempotencyRepositoryPort
import com.back.boundedContexts.post.domain.PostWriteRequestIdempotency
import org.springframework.stereotype.Component

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
}
