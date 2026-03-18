package com.back.boundedContexts.post.application.port.output

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.PostWriteRequestIdempotency
import java.time.Instant

/**
 * `PostWriteRequestIdempotencyRepositoryPort` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
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
