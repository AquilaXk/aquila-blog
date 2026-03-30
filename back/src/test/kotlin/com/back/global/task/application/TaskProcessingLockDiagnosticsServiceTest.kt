package com.back.global.task.application

import com.back.global.task.application.TaskProcessingLockDiagnosticsService.Companion.PROCESS_TASKS_LOCK_KEY
import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.domain.Pageable
import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Instant
import java.util.concurrent.TimeUnit
import java.util.stream.Stream

class TaskProcessingLockDiagnosticsServiceTest {
    private val redisTemplate = mock(StringRedisTemplate::class.java)

    @Test
    fun `legacy processTasks lock이 ready backlog를 막으면 자동 삭제 대상으로 판단한다`() {
        given(redisTemplate.hasKey(PROCESS_TASKS_LOCK_KEY)).willReturn(true)
        given(redisTemplate.getExpire(PROCESS_TASKS_LOCK_KEY, TimeUnit.SECONDS)).willReturn(7200L)
        given(redisTemplate.delete(PROCESS_TASKS_LOCK_KEY)).willReturn(true)

        val service =
            TaskProcessingLockDiagnosticsService(
                stringRedisTemplateProvider = objectProvider(redisTemplate),
                taskQueueRepository = fakeTaskQueueRepository(readyPendingCount = 3L, processingCount = 0L),
                currentNodeWorkerEnabled = true,
                currentNodeApiMode = "all",
                legacyLockCleanupThresholdSeconds = 300,
            )

        val diagnostics = service.diagnose()
        val cleanupResult = service.clearLegacyProcessTasksLockIfNeeded()

        assertTrue(diagnostics.legacyOrphanLikely)
        assertEquals(7200L, diagnostics.processTasksLockTtlSeconds)
        assertTrue(cleanupResult.attempted)
        assertTrue(cleanupResult.deleted)
        verify(redisTemplate).delete(PROCESS_TASKS_LOCK_KEY)
    }

    @Test
    fun `현재 lock ttl이 짧으면 legacy processTasks lock으로 삭제하지 않는다`() {
        given(redisTemplate.hasKey(PROCESS_TASKS_LOCK_KEY)).willReturn(true)
        given(redisTemplate.getExpire(PROCESS_TASKS_LOCK_KEY, TimeUnit.SECONDS)).willReturn(90L)

        val service =
            TaskProcessingLockDiagnosticsService(
                stringRedisTemplateProvider = objectProvider(redisTemplate),
                taskQueueRepository = fakeTaskQueueRepository(readyPendingCount = 2L, processingCount = 0L),
                currentNodeWorkerEnabled = true,
                currentNodeApiMode = "all",
                legacyLockCleanupThresholdSeconds = 300,
            )

        val cleanupResult = service.clearLegacyProcessTasksLockIfNeeded()

        assertFalse(cleanupResult.diagnostics.legacyOrphanLikely)
        assertFalse(cleanupResult.attempted)
        assertFalse(cleanupResult.deleted)
        verify(redisTemplate, never()).delete(PROCESS_TASKS_LOCK_KEY)
    }

    private fun objectProvider(redisTemplate: StringRedisTemplate?): ObjectProvider<StringRedisTemplate> =
        object : ObjectProvider<StringRedisTemplate> {
            override fun getObject(vararg args: Any?): StringRedisTemplate = redisTemplate ?: error("No redis template")

            override fun getIfAvailable(): StringRedisTemplate? = redisTemplate

            override fun getIfUnique(): StringRedisTemplate? = redisTemplate

            override fun iterator(): MutableIterator<StringRedisTemplate> = listOfNotNull(redisTemplate).toMutableList().iterator()

            override fun stream(): Stream<StringRedisTemplate> = listOfNotNull(redisTemplate).stream()

            override fun orderedStream(): Stream<StringRedisTemplate> = stream()
        }

    private fun fakeTaskQueueRepository(
        readyPendingCount: Long,
        processingCount: Long,
    ): TaskQueueRepositoryPort =
        object : TaskQueueRepositoryPort {
            override fun save(task: Task): Task = error("not used")

            override fun countByStatus(status: TaskStatus): Long =
                when (status) {
                    TaskStatus.PROCESSING -> processingCount
                    else -> error("not used")
                }

            override fun countByStatusAndNextRetryAtLessThanEqual(
                status: TaskStatus,
                nextRetryAt: Instant,
            ): Long =
                when (status) {
                    TaskStatus.PENDING -> readyPendingCount
                    else -> error("not used")
                }

            override fun countByStatusAndModifiedAtBefore(
                status: TaskStatus,
                modifiedAt: Instant,
            ): Long = error("not used")

            override fun countByTaskTypeAndStatus(
                taskType: String,
                status: TaskStatus,
            ): Long = error("not used")

            override fun countByTaskTypeAndStatusAndNextRetryAtLessThanEqual(
                taskType: String,
                status: TaskStatus,
                nextRetryAt: Instant,
            ): Long = error("not used")

            override fun countByTaskTypeAndStatusAndModifiedAtBefore(
                taskType: String,
                status: TaskStatus,
                modifiedAt: Instant,
            ): Long = error("not used")

            override fun findByStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
                status: TaskStatus,
                nextRetryAt: Instant,
                pageable: Pageable,
            ): List<Task> = error("not used")

            override fun findByStatusOrderByModifiedAtAsc(
                status: TaskStatus,
                pageable: Pageable,
            ): List<Task> = error("not used")

            override fun findByStatusOrderByModifiedAtDesc(
                status: TaskStatus,
                pageable: Pageable,
            ): List<Task> = error("not used")

            override fun findByStatusAndModifiedAtBeforeOrderByModifiedAtAsc(
                status: TaskStatus,
                modifiedAt: Instant,
                pageable: Pageable,
            ): List<Task> = error("not used")

            override fun findByTaskTypeAndStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
                taskType: String,
                status: TaskStatus,
                nextRetryAt: Instant,
                pageable: Pageable,
            ): List<Task> = error("not used")

            override fun findByTaskTypeAndStatusOrderByModifiedAtDesc(
                taskType: String,
                status: TaskStatus,
                pageable: Pageable,
            ): List<Task> = error("not used")
        }
}
