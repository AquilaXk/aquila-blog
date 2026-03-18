package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostWriteRequestIdempotencyRepositoryPort
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * PostWriteRequestIdempotencyRetentionService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class PostWriteRequestIdempotencyRetentionService(
    private val postWriteRequestIdempotencyRepository: PostWriteRequestIdempotencyRepositoryPort,
    @param:Value("\${custom.post.idempotency.retentionDays:30}")
    private val retentionDays: Int,
) {
    /**
     * purgeExpired 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    @Transactional
    fun purgeExpired(batchSize: Int): Int {
        val safeBatchSize = batchSize.coerceIn(1, 1_000)
        val cutoff = Instant.now().minus(retentionDays.coerceAtLeast(1).toLong(), ChronoUnit.DAYS)
        val expiredEntries = postWriteRequestIdempotencyRepository.findExpired(cutoff, safeBatchSize)
        if (expiredEntries.isEmpty()) return 0

        postWriteRequestIdempotencyRepository.deleteAll(expiredEntries)

        return expiredEntries.size
    }
}
