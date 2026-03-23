package com.back.boundedContexts.post.application.service

import com.back.global.exception.application.AppException
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

/**
 * 공개 조회 API(read path)에 대한 동시성 상한을 제어해 과부하 시 5xx 연쇄를 줄입니다.
 * 운영에서는 빠른 실패(짧은 대기 후 503)로 DB/스레드 풀 고갈을 방지합니다.
 */
@Service
class PostReadBulkheadService(
    @param:Value("\${custom.post.read.bulkhead.enabled:true}")
    private val enabled: Boolean,
    @param:Value("\${custom.post.read.bulkhead.acquireTimeoutMs:25}")
    private val acquireTimeoutMs: Long,
    @param:Value("\${custom.post.read.bulkhead.feedMaxConcurrent:20}")
    private val feedMaxConcurrent: Int,
    @param:Value("\${custom.post.read.bulkhead.exploreMaxConcurrent:10}")
    private val exploreMaxConcurrent: Int,
    @param:Value("\${custom.post.read.bulkhead.searchMaxConcurrent:8}")
    private val searchMaxConcurrent: Int,
    @param:Value("\${custom.post.read.bulkhead.detailMaxConcurrent:16}")
    private val detailMaxConcurrent: Int,
    @param:Value("\${custom.post.read.bulkhead.tagsMaxConcurrent:6}")
    private val tagsMaxConcurrent: Int,
) {
    private val feedSemaphore = Semaphore(feedMaxConcurrent.coerceAtLeast(1))
    private val exploreSemaphore = Semaphore(exploreMaxConcurrent.coerceAtLeast(1))
    private val searchSemaphore = Semaphore(searchMaxConcurrent.coerceAtLeast(1))
    private val detailSemaphore = Semaphore(detailMaxConcurrent.coerceAtLeast(1))
    private val tagsSemaphore = Semaphore(tagsMaxConcurrent.coerceAtLeast(1))

    fun <T> withFeedPermit(block: () -> T): T = withPermit(feedSemaphore, block)

    fun <T> withExplorePermit(block: () -> T): T = withPermit(exploreSemaphore, block)

    fun <T> withSearchPermit(block: () -> T): T = withPermit(searchSemaphore, block)

    fun <T> withDetailPermit(block: () -> T): T = withPermit(detailSemaphore, block)

    fun <T> withTagsPermit(block: () -> T): T = withPermit(tagsSemaphore, block)

    private fun <T> withPermit(
        semaphore: Semaphore,
        block: () -> T,
    ): T {
        if (!enabled) return block()

        val timeoutMillis = acquireTimeoutMs.coerceIn(0, 5_000)
        val acquired =
            try {
                if (timeoutMillis == 0L) {
                    semaphore.tryAcquire()
                } else {
                    semaphore.tryAcquire(timeoutMillis, TimeUnit.MILLISECONDS)
                }
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
                throw AppException("503-1", "요청이 많아 잠시 후 다시 시도해주세요.")
            }

        if (!acquired) {
            throw AppException("503-1", "요청이 많아 잠시 후 다시 시도해주세요.")
        }

        try {
            return block()
        } finally {
            semaphore.release()
        }
    }
}
