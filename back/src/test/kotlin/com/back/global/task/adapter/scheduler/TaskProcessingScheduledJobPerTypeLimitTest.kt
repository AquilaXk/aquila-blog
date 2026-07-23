package com.back.global.task.adapter.scheduler

import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.application.TaskExecutionContextHolder
import com.back.global.task.application.TaskHandlerEntry
import com.back.global.task.application.TaskHandlerMethod
import com.back.global.task.application.TaskHandlerRegistry
import com.back.global.task.application.TaskRetryPolicy
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import com.back.standard.dto.TaskPayload
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyInt
import org.mockito.ArgumentMatchers.eq
import org.mockito.Mockito.mock
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.Optional
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

class TaskProcessingScheduledJobPerTypeLimitTest {
    @Test
    @DisplayName("dynamic batch prefetch가 커져도 실제 시작 worker는 dynamic target을 넘지 않는다")
    fun `dynamic batch prefetch does not start more workers than dynamic target`() {
        val startedWorkers = AtomicInteger(0)
        val releaseWorkers = CountDownLatch(1)
        val taskType = "test.dynamic-prefetch"
        val payload = ObjectMapper().writeValueAsString(StubPayload())
        val tasks =
            (1L..10L).map { id ->
                Task(
                    id = id,
                    uid = UUID.randomUUID(),
                    aggregateType = "test",
                    aggregateId = id,
                    taskType = taskType,
                    payload = payload,
                )
            }
        val fixture =
            createFixture(
                maxConcurrent = 8,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = false,
                perTypeAutoTuneMinConcurrent = 1,
                dynamicConcurrencyEnabled = true,
                dynamicMinConcurrent = 1,
                dynamicBacklogPerSlot = 2,
                dynamicBatchBacklogPerStep = 5,
                dynamicBatchMaxPrefetchMultiplier = 2,
                handlerEntries = listOf(blockingTaskHandlerEntry(taskType, startedWorkers, releaseWorkers)),
            )
        org.mockito.Mockito
            .`when`(
                fixture.taskRepository.countByStatusAndNextRetryAtLessThanEqual(
                    pendingStatus(),
                    anyInstant(),
                ),
            ).thenReturn(10L)
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findPendingTasksWithLock(10))
            .thenReturn(tasks)
        tasks.forEach { task ->
            org.mockito.Mockito
                .`when`(fixture.taskRepository.findById(task.id))
                .thenReturn(Optional.of(task))
        }

        try {
            fixture.job.processTasks()
            waitUntilWorkerCount(startedWorkers, expected = 5)

            assertThat(startedWorkers.get()).isEqualTo(5)
            assertThat(tasks.count { it.status == TaskStatus.PENDING }).isEqualTo(5)
        } finally {
            releaseWorkers.countDown()
            fixture.job.shutdownExecutor()
        }
    }

    @Test
    @DisplayName("stale 실행은 retry 실행의 PROCESSING 상태를 완료로 확정하지 못한다")
    fun `stale execution cannot complete retried processing task`() {
        val taskType = "test.timeout-fencing"
        val payload = ObjectMapper().writeValueAsString(StubPayload())
        val task =
            Task(
                id = 1L,
                uid = UUID.randomUUID(),
                aggregateType = "test",
                aggregateId = 1L,
                taskType = taskType,
                payload = payload,
            )
        val handler = AttemptBlockingHandler()
        val fixture =
            createFixture(
                maxConcurrent = 2,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = false,
                perTypeAutoTuneMinConcurrent = 1,
                dynamicConcurrencyEnabled = false,
                handlerEntries = listOf(attemptBlockingTaskHandlerEntry(taskType, handler)),
            )
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findStaleProcessingTasksWithLock(anyInstant(), anyInt()))
            .thenReturn(emptyList(), listOf(task))
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findPendingTasksWithLock(anyInt()))
            .thenReturn(listOf(task), listOf(task), emptyList())
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findById(task.id))
            .thenReturn(Optional.of(task))

        try {
            fixture.job.processTasks()
            assertThat(handler.firstStarted.await(1, TimeUnit.SECONDS)).isTrue()

            fixture.job.processTasks()
            assertThat(handler.retryStarted.await(1, TimeUnit.SECONDS)).isTrue()

            handler.releaseFirst.countDown()
            assertThat(handler.firstReturned.await(1, TimeUnit.SECONDS)).isTrue()
            assertStatusRemains(task, TaskStatus.PROCESSING)

            assertThat(task.status).isEqualTo(TaskStatus.PROCESSING)

            handler.releaseRetry.countDown()
            waitUntilStatus(task, TaskStatus.COMPLETED)
            assertThat(task.status).isEqualTo(TaskStatus.COMPLETED)
        } finally {
            handler.releaseFirst.countDown()
            handler.releaseRetry.countDown()
            fixture.job.shutdownExecutor()
        }
    }

    @Test
    @DisplayName("지연 시작 stale worker는 retry lease를 대신 실행하지 않는다")
    fun `delayed stale worker cannot adopt retry lease`() {
        val taskType = "test.delayed-timeout-fencing"
        val payload = ObjectMapper().writeValueAsString(StubPayload())
        val task =
            Task(
                id = 1L,
                uid = UUID.randomUUID(),
                aggregateType = "test",
                aggregateId = 1L,
                taskType = taskType,
                payload = payload,
            )
        val handler = CountingBlockingHandler()
        val firstFindStarted = CountDownLatch(1)
        val releaseFirstFind = CountDownLatch(1)
        val findByIdCalls = AtomicInteger(0)
        val fixture =
            createFixture(
                maxConcurrent = 2,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = false,
                perTypeAutoTuneMinConcurrent = 1,
                dynamicConcurrencyEnabled = false,
                handlerEntries = listOf(countingBlockingTaskHandlerEntry(taskType, handler)),
            )
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findStaleProcessingTasksWithLock(anyInstant(), anyInt()))
            .thenReturn(emptyList(), listOf(task))
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findPendingTasksWithLock(anyInt()))
            .thenReturn(listOf(task), listOf(task), emptyList())
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findById(task.id))
            .thenAnswer {
                if (findByIdCalls.incrementAndGet() == 1) {
                    firstFindStarted.countDown()
                    releaseFirstFind.await(5, TimeUnit.SECONDS)
                }
                Optional.of(task)
            }

        try {
            fixture.job.processTasks()
            assertThat(firstFindStarted.await(1, TimeUnit.SECONDS)).isTrue()

            fixture.job.processTasks()
            assertThat(handler.started.await(1, TimeUnit.SECONDS)).isTrue()
            assertThat(handler.invocations.get()).isEqualTo(1)

            releaseFirstFind.countDown()
            assertAtomicCountRemains(handler.invocations, expected = 1)

            handler.release.countDown()
            waitUntilStatus(task, TaskStatus.COMPLETED)
            assertThat(task.status).isEqualTo(TaskStatus.COMPLETED)
        } finally {
            releaseFirstFind.countDown()
            handler.release.countDown()
            fixture.job.shutdownExecutor()
        }
    }

    @Test
    @DisplayName("handler는 task UID 기반 idempotency key를 실행 context에서 조회할 수 있다")
    fun `handler can read task uid idempotency key from execution context`() {
        val taskType = "test.execution-context"
        val taskUid = UUID.randomUUID()
        val payload = ObjectMapper().writeValueAsString(StubPayload(uid = taskUid))
        val task =
            Task(
                id = 1L,
                uid = taskUid,
                aggregateType = "test",
                aggregateId = 1L,
                taskType = taskType,
                payload = payload,
            )
        val handler = ContextCapturingHandler()
        val fixture =
            createFixture(
                maxConcurrent = 1,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = false,
                perTypeAutoTuneMinConcurrent = 1,
                dynamicConcurrencyEnabled = false,
                handlerEntries = listOf(contextCapturingTaskHandlerEntry(taskType, handler)),
            )
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findStaleProcessingTasksWithLock(anyInstant(), anyInt()))
            .thenReturn(emptyList())
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findPendingTasksWithLock(anyInt()))
            .thenReturn(listOf(task), emptyList())
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findById(task.id))
            .thenReturn(Optional.of(task))

        try {
            fixture.job.processTasks()
            assertThat(handler.handled.await(1, TimeUnit.SECONDS)).isTrue()

            assertThat(handler.capturedIdempotencyKey.get()).isEqualTo(taskUid.toString())
            assertThat(TaskExecutionContextHolder.current()).isNull()
        } finally {
            fixture.job.shutdownExecutor()
        }
    }

    private data class JobFixture(
        val job: TaskProcessingScheduledJob,
        val taskRepository: TaskRepository,
    )

    private data class StubPayload(
        override val uid: UUID = UUID.randomUUID(),
        override val aggregateType: String = "test",
        override val aggregateId: Long = 1,
    ) : TaskPayload

    private fun createFixture(
        maxConcurrent: Int,
        perTypeMaxConcurrentRaw: String,
        perTypeAutoTuneEnabled: Boolean,
        perTypeAutoTuneMinConcurrent: Int,
        registeredTaskTypes: List<String> = emptyList(),
        dynamicConcurrencyEnabled: Boolean = true,
        dynamicMinConcurrent: Int = 2,
        dynamicBacklogPerSlot: Int = 25,
        dynamicBatchBacklogPerStep: Int = 120,
        dynamicBatchMaxPrefetchMultiplier: Int = 2,
        handlerEntries: List<TaskHandlerEntry> = emptyList(),
    ): JobFixture {
        val taskRepository = mock(TaskRepository::class.java)
        val taskHandlerRegistry = mock(TaskHandlerRegistry::class.java)
        if (registeredTaskTypes.isNotEmpty()) {
            org.mockito.Mockito
                .`when`(taskHandlerRegistry.getRegisteredEntries())
                .thenReturn(registeredTaskTypes.map { taskType -> taskHandlerEntry(taskType) })
        }
        handlerEntries.forEach { entry ->
            org.mockito.Mockito
                .`when`(taskHandlerRegistry.getEntry(entry.taskType))
                .thenReturn(entry)
            org.mockito.Mockito
                .`when`(taskHandlerRegistry.getRetryPolicy(entry.taskType))
                .thenReturn(entry.retryPolicy)
        }

        val job =
            TaskProcessingScheduledJob(
                taskRepository = taskRepository,
                taskHandlerRegistry = taskHandlerRegistry,
                transactionTemplate = TransactionTemplate(NoopTransactionManager()),
                objectMapper = ObjectMapper(),
                batchSize = 50,
                processingTimeoutSeconds = 900,
                maxConcurrent = maxConcurrent,
                handlerTimeoutSeconds = 120,
                dynamicConcurrencyEnabled = dynamicConcurrencyEnabled,
                dynamicMinConcurrent = dynamicMinConcurrent,
                dynamicBacklogPerSlot = dynamicBacklogPerSlot,
                dynamicBatchSizeEnabled = true,
                dynamicBatchMinSize = 4,
                dynamicBatchBacklogPerStep = dynamicBatchBacklogPerStep,
                dynamicBatchTargetHandlerDurationMs = 900,
                dynamicBatchMaxPrefetchMultiplier = dynamicBatchMaxPrefetchMultiplier,
                perTypeMaxConcurrentRaw = perTypeMaxConcurrentRaw,
                perTypeAutoTuneEnabled = perTypeAutoTuneEnabled,
                perTypeAutoTuneMinConcurrent = perTypeAutoTuneMinConcurrent,
                perTypeAutoTuneRefreshMs = 15_000,
                meterRegistry = null,
            )

        return JobFixture(job, taskRepository)
    }

    private fun taskHandlerEntry(taskType: String): TaskHandlerEntry =
        TaskHandlerEntry(
            taskType = taskType,
            payloadClass = StubPayload::class.java,
            handlerMethod =
                TaskHandlerMethod(
                    bean = this,
                    method =
                        TaskProcessingScheduledJobPerTypeLimitTest::class.java.getDeclaredMethod(
                            "handleStubPayload",
                            StubPayload::class.java,
                        ),
                ),
            retryPolicy = TaskRetryPolicy.fallback(taskType),
        )

    private fun blockingTaskHandlerEntry(
        taskType: String,
        startedWorkers: AtomicInteger,
        releaseWorkers: CountDownLatch,
    ): TaskHandlerEntry {
        val handler = BlockingHandler(startedWorkers, releaseWorkers)
        return TaskHandlerEntry(
            taskType = taskType,
            payloadClass = StubPayload::class.java,
            handlerMethod =
                TaskHandlerMethod(
                    bean = handler,
                    method =
                        BlockingHandler::class.java.getDeclaredMethod(
                            "handle",
                            StubPayload::class.java,
                        ),
                ),
            retryPolicy = TaskRetryPolicy.fallback(taskType),
        )
    }

    private fun attemptBlockingTaskHandlerEntry(
        taskType: String,
        handler: AttemptBlockingHandler,
    ): TaskHandlerEntry =
        TaskHandlerEntry(
            taskType = taskType,
            payloadClass = StubPayload::class.java,
            handlerMethod =
                TaskHandlerMethod(
                    bean = handler,
                    method =
                        AttemptBlockingHandler::class.java.getDeclaredMethod(
                            "handle",
                            StubPayload::class.java,
                        ),
                ),
            retryPolicy = TaskRetryPolicy.fallback(taskType),
        )

    private fun contextCapturingTaskHandlerEntry(
        taskType: String,
        handler: ContextCapturingHandler,
    ): TaskHandlerEntry =
        TaskHandlerEntry(
            taskType = taskType,
            payloadClass = StubPayload::class.java,
            handlerMethod =
                TaskHandlerMethod(
                    bean = handler,
                    method =
                        ContextCapturingHandler::class.java.getDeclaredMethod(
                            "handle",
                            StubPayload::class.java,
                        ),
                ),
            retryPolicy = TaskRetryPolicy.fallback(taskType),
        )

    private fun countingBlockingTaskHandlerEntry(
        taskType: String,
        handler: CountingBlockingHandler,
    ): TaskHandlerEntry =
        TaskHandlerEntry(
            taskType = taskType,
            payloadClass = StubPayload::class.java,
            handlerMethod =
                TaskHandlerMethod(
                    bean = handler,
                    method =
                        CountingBlockingHandler::class.java.getDeclaredMethod(
                            "handle",
                            StubPayload::class.java,
                        ),
                ),
            retryPolicy = TaskRetryPolicy.fallback(taskType),
        )

    private class BlockingHandler(
        private val startedWorkers: AtomicInteger,
        private val releaseWorkers: CountDownLatch,
    ) {
        fun handle(payload: StubPayload) {
            startedWorkers.incrementAndGet()
            releaseWorkers.await(5, TimeUnit.SECONDS)
        }
    }

    private class AttemptBlockingHandler {
        val firstStarted = CountDownLatch(1)
        val retryStarted = CountDownLatch(1)
        val releaseFirst = CountDownLatch(1)
        val releaseRetry = CountDownLatch(1)
        val firstReturned = CountDownLatch(1)
        private val attempts = AtomicInteger(0)

        fun handle(payload: StubPayload) {
            when (attempts.incrementAndGet()) {
                1 -> {
                    firstStarted.countDown()
                    releaseFirst.await(5, TimeUnit.SECONDS)
                    firstReturned.countDown()
                }

                2 -> {
                    retryStarted.countDown()
                    releaseRetry.await(5, TimeUnit.SECONDS)
                }
            }
        }
    }

    private class CountingBlockingHandler {
        val started = CountDownLatch(1)
        val release = CountDownLatch(1)
        val invocations = AtomicInteger(0)

        fun handle(payload: StubPayload) {
            invocations.incrementAndGet()
            started.countDown()
            release.await(5, TimeUnit.SECONDS)
        }
    }

    private class ContextCapturingHandler {
        val handled = CountDownLatch(1)
        val capturedIdempotencyKey = AtomicReference<String?>()

        fun handle(payload: StubPayload) {
            capturedIdempotencyKey.set(TaskExecutionContextHolder.current()?.idempotencyKey)
            handled.countDown()
        }
    }

    private class NoopTransactionManager : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()

        override fun commit(status: TransactionStatus) = Unit

        override fun rollback(status: TransactionStatus) = Unit
    }

    @Suppress("unused")
    private fun handleStubPayload(payload: StubPayload) = Unit

    private fun waitUntilWorkerCount(
        startedWorkers: AtomicInteger,
        expected: Int,
    ) {
        repeat(40) {
            if (startedWorkers.get() >= expected) return
            Thread.sleep(25)
        }
    }

    private fun waitUntilStatus(
        task: Task,
        expected: TaskStatus,
    ) {
        repeat(40) {
            if (task.status == expected) return
            Thread.sleep(25)
        }
    }

    private fun assertStatusRemains(
        task: Task,
        expected: TaskStatus,
    ) {
        repeat(10) {
            assertThat(task.status).isEqualTo(expected)
            Thread.sleep(25)
        }
    }

    private fun assertAtomicCountRemains(
        actual: AtomicInteger,
        expected: Int,
    ) {
        repeat(10) {
            assertThat(actual.get()).isEqualTo(expected)
            Thread.sleep(25)
        }
    }

    private fun anyInstant(): Instant {
        any(Instant::class.java)
        return Instant.EPOCH
    }

    private fun pendingStatus(): TaskStatus {
        eq(TaskStatus.PENDING)
        return TaskStatus.PENDING
    }
}
