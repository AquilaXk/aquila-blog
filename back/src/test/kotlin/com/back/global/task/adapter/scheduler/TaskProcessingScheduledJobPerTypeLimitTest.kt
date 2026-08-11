package com.back.global.task.adapter.scheduler

import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.global.task.application.TaskExecutionContextHolder
import com.back.global.task.application.TaskHandlerEntry
import com.back.global.task.application.TaskHandlerMethod
import com.back.global.task.application.TaskHandlerRegistry
import com.back.global.task.application.TaskPayloadEnvelopeCodec
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
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
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
        val tasks =
            (1L..10L).map { id -> task(id, taskType) }
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
        val task = task(1L, taskType)
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
        val task = task(1L, taskType)
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
        val task = task(1L, taskType, taskUid)
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

    @Test
    @DisplayName("등록되지 않은 task type은 handler 없이 quarantine하고 payload를 지운다")
    fun `unknown task type is quarantined without handler execution`() {
        val task = task(1L, "test.unknown-task-type")
        val fixture =
            createFixture(
                maxConcurrent = 1,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = false,
                perTypeAutoTuneMinConcurrent = 1,
                dynamicConcurrencyEnabled = false,
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
            waitUntilStatus(task, TaskStatus.QUARANTINED)

            assertThat(task.status).isEqualTo(TaskStatus.QUARANTINED)
            assertThat(task.payload).isEqualTo(Task.REDACTED_PAYLOAD)
            assertThat(task.errorMessage).isEqualTo("UNKNOWN_TASK_TYPE")
            assertThat(task.retryCount).isZero()
        } finally {
            fixture.job.shutdownExecutor()
        }
    }

    @Test
    @DisplayName("malformed envelope은 등록 handler를 호출하지 않고 quarantine한다")
    fun `malformed envelope is quarantined without registered handler execution`() {
        val taskType = "test.malformed-envelope"
        val task = task(1L, taskType).apply { payload = "not-an-envelope" }
        val handler = CountingBlockingHandler()
        val fixture =
            createFixture(
                maxConcurrent = 1,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = false,
                perTypeAutoTuneMinConcurrent = 1,
                dynamicConcurrencyEnabled = false,
                handlerEntries = listOf(countingBlockingTaskHandlerEntry(taskType, handler)),
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
            waitUntilStatus(task, TaskStatus.QUARANTINED)

            assertThat(handler.invocations).hasValue(0)
            assertThat(task.payload).isEqualTo(Task.REDACTED_PAYLOAD)
            assertThat(task.errorMessage).isEqualTo("MALFORMED_ENVELOPE")
        } finally {
            handler.release.countDown()
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

    private fun task(
        id: Long,
        taskType: String,
        uid: UUID = UUID.randomUUID(),
    ): Task {
        val payload = StubPayload(uid = uid, aggregateId = id)
        return Task(
            id = id,
            uid = uid,
            aggregateType = payload.aggregateType,
            aggregateId = payload.aggregateId,
            taskType = taskType,
            payload = payloadEnvelopeCodec().encode(payload, taskHandlerEntry(taskType)),
        )
    }

    private fun payloadEnvelopeCodec(): TaskPayloadEnvelopeCodec =
        TaskPayloadEnvelopeCodec(
            jacksonObjectMapper(),
            Clock.fixed(Instant.parse("2026-08-11T00:00:00Z"), ZoneOffset.UTC),
        )

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
                taskPayloadEnvelopeCodec = payloadEnvelopeCodec(),
                transactionTemplate = TransactionTemplate(NoopTransactionManager()),
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
        TaskHandlerEntry.withExactDecoders(
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
            retryPolicy = taskRetryPolicy(taskType),
            schemaVersion = 2,
            sensitivity = TaskPayloadSensitivity.INTERNAL,
        )

    private fun blockingTaskHandlerEntry(
        taskType: String,
        startedWorkers: AtomicInteger,
        releaseWorkers: CountDownLatch,
    ): TaskHandlerEntry {
        val handler = BlockingHandler(startedWorkers, releaseWorkers)
        return TaskHandlerEntry.withExactDecoders(
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
            retryPolicy = taskRetryPolicy(taskType),
            schemaVersion = 2,
            sensitivity = TaskPayloadSensitivity.INTERNAL,
        )
    }

    private fun attemptBlockingTaskHandlerEntry(
        taskType: String,
        handler: AttemptBlockingHandler,
    ): TaskHandlerEntry =
        TaskHandlerEntry.withExactDecoders(
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
            retryPolicy = taskRetryPolicy(taskType),
            schemaVersion = 2,
            sensitivity = TaskPayloadSensitivity.INTERNAL,
        )

    private fun contextCapturingTaskHandlerEntry(
        taskType: String,
        handler: ContextCapturingHandler,
    ): TaskHandlerEntry =
        TaskHandlerEntry.withExactDecoders(
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
            retryPolicy = taskRetryPolicy(taskType),
            schemaVersion = 2,
            sensitivity = TaskPayloadSensitivity.INTERNAL,
        )

    private fun countingBlockingTaskHandlerEntry(
        taskType: String,
        handler: CountingBlockingHandler,
    ): TaskHandlerEntry =
        TaskHandlerEntry.withExactDecoders(
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
            retryPolicy = taskRetryPolicy(taskType),
            schemaVersion = 2,
            sensitivity = TaskPayloadSensitivity.INTERNAL,
        )

    private fun taskRetryPolicy(taskType: String): TaskRetryPolicy =
        TaskRetryPolicy(
            label = taskType,
            maxRetries = 10,
            baseDelaySeconds = 180,
            backoffMultiplier = 3.0,
            maxDelaySeconds = 21_600,
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
