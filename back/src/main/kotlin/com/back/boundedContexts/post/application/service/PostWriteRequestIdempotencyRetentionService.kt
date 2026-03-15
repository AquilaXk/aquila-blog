package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostWriteRequestIdempotencyRepositoryPort
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit

@Service
class PostWriteRequestIdempotencyRetentionService(
    private val postWriteRequestIdempotencyRepository: PostWriteRequestIdempotencyRepositoryPort,
    @param:Value("\${custom.post.idempotency.retentionDays:30}")
    private val retentionDays: Int,
) {
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
