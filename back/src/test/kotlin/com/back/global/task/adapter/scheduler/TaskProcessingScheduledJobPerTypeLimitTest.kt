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
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyInt
import org.mockito.ArgumentMatchers.eq
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.springframework.context.event.ContextClosedEvent
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.time.Clock
import java.time.Duration
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
    @DisplayName("잘못된 per-type concurrency 설정은 startup에서 실패한다")
    fun `invalid per type concurrency configuration fails startup`() {
        assertThatThrownBy {
            val fixture =
                createFixture(
                    maxConcurrent = 8,
                    perTypeMaxConcurrentRaw = "post.read.prewarm=2,broken-token",
                    perTypeAutoTuneEnabled = true,
                    perTypeAutoTuneMinConcurrent = 1,
                )
            fixture.job.shutdownExecutor()
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("perTypeMaxConcurrent")

        listOf(-1, 0, 257).forEach { invalidLimit ->
            assertThatThrownBy {
                val fixture =
                    createFixture(
                        maxConcurrent = 2,
                        perTypeMaxConcurrentRaw = "post.search-index.sync=$invalidLimit",
                        perTypeAutoTuneEnabled = true,
                        perTypeAutoTuneMinConcurrent = 1,
                    )
                fixture.job.shutdownExecutor()
            }.isInstanceOf(IllegalArgumentException::class.java)
                .hasMessageContaining("perTypeMaxConcurrent")
        }
    }

    @Test
    @DisplayName("운영 global concurrency보다 큰 per-type ceiling은 시작되고 실제 worker 수는 global limit을 따른다")
    fun `production per type ceiling is clamped by global worker concurrency`() {
        val startedWorkers = AtomicInteger(0)
        val releaseWorkers = CountDownLatch(1)
        val taskType = "post.search-index.sync"
        val tasks = (1L..3L).map { id -> task(id, taskType) }
        val fixture =
            createFixture(
                maxConcurrent = 2,
                perTypeMaxConcurrentRaw =
                    "post.search-index.sync=4,post.read.prewarm=2,post.search-engine.mirror=1",
                perTypeAutoTuneEnabled = true,
                perTypeAutoTuneMinConcurrent = 1,
                dynamicConcurrencyEnabled = false,
                handlerEntries = listOf(blockingTaskHandlerEntry(taskType, startedWorkers, releaseWorkers)),
            )
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findStaleProcessingTasksWithLock(anyInstant(), anyInt()))
            .thenReturn(emptyList())
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findPendingTasksWithLock(2))
            .thenReturn(tasks)
        tasks.forEach { task ->
            org.mockito.Mockito
                .`when`(fixture.taskRepository.findById(task.id))
                .thenReturn(Optional.of(task))
        }

        try {
            fixture.job.processTasks()
            waitUntilWorkerCount(startedWorkers, expected = 2)

            assertThat(startedWorkers.get()).isEqualTo(2)
            assertThat(tasks.count { it.status == TaskStatus.PENDING }).isEqualTo(1)
        } finally {
            releaseWorkers.countDown()
            fixture.job.shutdownExecutor()
        }
    }

    @Test
    @DisplayName("ready backlog 조회 실패는 현재 poll을 중단하고 availability를 0으로 기록한다")
    fun `ready backlog failure aborts current poll and records unavailability`() {
        val fixture =
            createFixture(
                maxConcurrent = 8,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = false,
                perTypeAutoTuneMinConcurrent = 1,
                dynamicConcurrencyEnabled = true,
            )
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findStaleProcessingTasksWithLock(anyInstant(), anyInt()))
            .thenReturn(emptyList())
        org.mockito.Mockito
            .`when`(
                fixture.taskRepository.countByStatusAndNextRetryAtLessThanEqual(
                    pendingStatus(),
                    anyInstant(),
                ),
            ).thenThrow(IllegalStateException("database unavailable"))

        try {
            fixture.job.processTasks()

            verify(fixture.taskRepository, never()).findPendingTasksWithLock(anyInt())
            assertThat(
                fixture.meterRegistry
                    .get("task.processor.queue.available")
                    .gauge()
                    .value(),
            ).isZero()
            assertThat(
                fixture.meterRegistry
                    .get("task.processor.queue.errors")
                    .counter()
                    .count(),
            ).isEqualTo(1.0)
        } finally {
            fixture.job.shutdownExecutor()
        }
    }

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
    @DisplayName("context close listener는 pending query를 기다리지 않고 claim을 차단한다")
    fun `context close listener returns before pending query release and prevents claims`() {
        val taskType = "test.context-close-claim"
        val task = task(1L, taskType)
        val queryStarted = CountDownLatch(1)
        val releaseQuery = CountDownLatch(1)
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
            .thenAnswer {
                queryStarted.countDown()
                releaseQuery.await(5, TimeUnit.SECONDS)
                listOf(task)
            }

        val contextClosedEvent = mock(ContextClosedEvent::class.java)
        val poll = Thread { fixture.job.processTasks() }
        val contextClose = Thread { fixture.job.onApplicationEvent(contextClosedEvent) }

        try {
            poll.start()
            assertThat(queryStarted.await(1, TimeUnit.SECONDS)).isTrue()
            contextClose.start()
            contextClose.join(1_000)

            assertThat(contextClose.isAlive).isFalse()
            releaseQuery.countDown()
            poll.join(1_000)

            assertThat(poll.isAlive).isFalse()
            assertThat(task.status).isEqualTo(TaskStatus.PENDING)
            assertThat(handler.invocations).hasValue(0)
        } finally {
            releaseQuery.countDown()
            handler.release.countDown()
            fixture.job.shutdownExecutor()
        }
    }

    @Test
    @DisplayName("drain 시작 중인 poll은 조회 반환 뒤 task를 claim하지 않는다")
    fun `drain start prevents claim after pending query returns`() {
        val taskType = "test.shutdown-claim-race"
        val task = task(1L, taskType)
        val queryStarted = CountDownLatch(1)
        val releaseQuery = CountDownLatch(1)
        val callback = CountDownLatch(1)
        val handler = CountingBlockingHandler()
        val fixture =
            createFixture(
                maxConcurrent = 1,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = false,
                perTypeAutoTuneMinConcurrent = 1,
                dynamicConcurrencyEnabled = false,
                workerShutdownTimeoutSeconds = 1,
                lifecycleShutdownPhaseTimeout = Duration.ofSeconds(2),
                handlerEntries = listOf(countingBlockingTaskHandlerEntry(taskType, handler)),
            )
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findStaleProcessingTasksWithLock(anyInstant(), anyInt()))
            .thenReturn(emptyList())
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findPendingTasksWithLock(anyInt()))
            .thenAnswer {
                queryStarted.countDown()
                releaseQuery.await(5, TimeUnit.SECONDS)
                listOf(task)
            }

        val poll = Thread { fixture.job.processTasks() }
        try {
            poll.start()
            assertThat(queryStarted.await(1, TimeUnit.SECONDS)).isTrue()

            fixture.job.stop(Runnable { callback.countDown() })
            waitUntilNotRunning(fixture.job)

            assertThat(callback.await(1_500, TimeUnit.MILLISECONDS)).isFalse()
            assertThat(
                fixture.meterRegistry
                    .get("task.processor.shutdown.timeouts")
                    .counter()
                    .count(),
            ).isEqualTo(1.0)
            releaseQuery.countDown()
            poll.join(1_000)

            assertThat(poll.isAlive).isFalse()
            assertThat(callback.await(50, TimeUnit.MILLISECONDS)).isFalse()
            assertThat(task.status).isEqualTo(TaskStatus.PENDING)
            assertThat(handler.invocations).hasValue(0)
        } finally {
            releaseQuery.countDown()
            handler.release.countDown()
            fixture.job.shutdownExecutor()
        }
    }

    @Test
    @DisplayName("drain 중 이미 claim된 worker는 nested handler submit을 완료한다")
    fun `shutdown drain preserves already claimed worker before nested handler submit`() {
        val taskType = "test.shutdown-nested-submit"
        val task = task(1L, taskType)
        val reachedHandlerLookup = CountDownLatch(1)
        val releaseHandlerLookup = CountDownLatch(1)
        val handler = CountingBlockingHandler()
        val fixture =
            createFixture(
                maxConcurrent = 1,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = false,
                perTypeAutoTuneMinConcurrent = 1,
                dynamicConcurrencyEnabled = false,
                workerShutdownTimeoutSeconds = 3,
                handlerEntries = listOf(countingBlockingTaskHandlerEntry(taskType, handler)),
            )
        val entry = fixture.taskHandlerRegistry.getEntry(taskType)
        org.mockito.Mockito
            .`when`(fixture.taskHandlerRegistry.getEntry(taskType))
            .thenAnswer {
                reachedHandlerLookup.countDown()
                releaseHandlerLookup.await(1, TimeUnit.SECONDS)
                entry
            }
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findStaleProcessingTasksWithLock(anyInstant(), anyInt()))
            .thenReturn(emptyList())
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findPendingTasksWithLock(anyInt()))
            .thenReturn(listOf(task))
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findById(task.id))
            .thenReturn(Optional.of(task))

        try {
            fixture.job.processTasks()
            assertThat(reachedHandlerLookup.await(1, TimeUnit.SECONDS)).isTrue()

            val shutdown = Thread { fixture.job.stop() }
            shutdown.start()
            waitUntilNotRunning(fixture.job)
            releaseHandlerLookup.countDown()

            assertThat(handler.started.await(1, TimeUnit.SECONDS)).isTrue()
            handler.release.countDown()
            shutdown.join(1_000)

            assertThat(shutdown.isAlive).isFalse()
            assertThat(handler.invocations).hasValue(1)
            assertThat(task.status).isEqualTo(TaskStatus.COMPLETED)
        } finally {
            releaseHandlerLookup.countDown()
            handler.release.countDown()
            fixture.job.shutdownExecutor()
        }
    }

    @Test
    @DisplayName("lifecycle stop callback은 active worker 종료 뒤에만 호출된다")
    fun `lifecycle stop callback waits for worker termination`() {
        val taskType = "test.shutdown-callback"
        val task = task(1L, taskType)
        val startedWorkers = AtomicInteger(0)
        val releaseWorkers = CountDownLatch(1)
        val callback = CountDownLatch(1)
        val fixture =
            createFixture(
                maxConcurrent = 1,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = false,
                perTypeAutoTuneMinConcurrent = 1,
                dynamicConcurrencyEnabled = false,
                workerShutdownTimeoutSeconds = 3,
                handlerEntries = listOf(blockingTaskHandlerEntry(taskType, startedWorkers, releaseWorkers)),
            )
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findStaleProcessingTasksWithLock(anyInstant(), anyInt()))
            .thenReturn(emptyList())
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findPendingTasksWithLock(anyInt()))
            .thenReturn(listOf(task))
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findById(task.id))
            .thenReturn(Optional.of(task))

        try {
            fixture.job.processTasks()
            waitUntilWorkerCount(startedWorkers, expected = 1)

            fixture.job.stop(Runnable { callback.countDown() })
            assertThat(callback.await(50, TimeUnit.MILLISECONDS)).isFalse()

            releaseWorkers.countDown()
            assertThat(callback.await(1, TimeUnit.SECONDS)).isTrue()
            assertThat(task.status).isEqualTo(TaskStatus.COMPLETED)
        } finally {
            releaseWorkers.countDown()
            fixture.job.shutdownExecutor()
        }
    }

    @Test
    @DisplayName("shutdown drain timeout은 counter를 남기고 active handler를 interrupt한다")
    fun `shutdown drain timeout records counter and interrupts active handler`() {
        val taskType = "test.shutdown-timeout"
        val task = task(1L, taskType)
        val handler = InterruptAwareHandler()
        val callback = CountDownLatch(1)
        val fixture =
            createFixture(
                maxConcurrent = 1,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = false,
                perTypeAutoTuneMinConcurrent = 1,
                dynamicConcurrencyEnabled = false,
                workerShutdownTimeoutSeconds = 1,
                handlerEntries = listOf(interruptAwareTaskHandlerEntry(taskType, handler)),
            )
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findStaleProcessingTasksWithLock(anyInstant(), anyInt()))
            .thenReturn(emptyList())
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findPendingTasksWithLock(anyInt()))
            .thenReturn(listOf(task))
        org.mockito.Mockito
            .`when`(fixture.taskRepository.findById(task.id))
            .thenReturn(Optional.of(task))

        try {
            fixture.job.processTasks()
            assertThat(handler.started.await(1, TimeUnit.SECONDS)).isTrue()

            fixture.job.stop(Runnable { callback.countDown() })
            assertThat(handler.interrupted.await(1_500, TimeUnit.MILLISECONDS)).isTrue()
            assertThat(
                fixture.meterRegistry
                    .get("task.processor.shutdown.timeouts")
                    .counter()
                    .count(),
            ).isEqualTo(1.0)
            assertThat(task.status).isNotEqualTo(TaskStatus.COMPLETED)
            assertThat(callback.await(50, TimeUnit.MILLISECONDS)).isFalse()
        } finally {
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
            waitUntilQuarantineCounter(fixture.meterRegistry, "unregistered", "UNKNOWN_TASK_TYPE")

            assertThat(task.status).isEqualTo(TaskStatus.QUARANTINED)
            assertThat(task.payload).isEqualTo(Task.REDACTED_PAYLOAD)
            assertThat(task.errorMessage).isEqualTo("UNKNOWN_TASK_TYPE")
            assertThat(task.retryCount).isZero()
            assertThat(
                fixture.meterRegistry
                    .get("task.payload.quarantine")
                    .tags("taskType", "unregistered", "reason", "UNKNOWN_TASK_TYPE")
                    .counter()
                    .count(),
            ).isEqualTo(1.0)
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
            waitUntilQuarantineCounter(fixture.meterRegistry, taskType, "MALFORMED_ENVELOPE")

            assertThat(handler.invocations).hasValue(0)
            assertThat(task.payload).isEqualTo(Task.REDACTED_PAYLOAD)
            assertThat(task.errorMessage).isEqualTo("MALFORMED_ENVELOPE")
            assertThat(
                fixture.meterRegistry
                    .get("task.payload.quarantine")
                    .tags("taskType", taskType, "reason", "MALFORMED_ENVELOPE")
                    .counter()
                    .count(),
            ).isEqualTo(1.0)
        } finally {
            handler.release.countDown()
            fixture.job.shutdownExecutor()
        }
    }

    @Test
    @DisplayName("unknown schema version은 handler 없이 quarantine하고 bounded reason metric을 남긴다")
    fun `unknown schema version records bounded quarantine metric`() {
        val taskType = "test.unknown-schema"
        val task =
            task(1L, taskType).apply {
                payload = payload.replaceFirst("\"schemaVersion\":2", "\"schemaVersion\":99")
            }
        assertThat(task.payload).contains("\"schemaVersion\":99")
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
            waitUntilQuarantineCounter(fixture.meterRegistry, taskType, "UNKNOWN_SCHEMA_VERSION")

            assertThat(handler.invocations).hasValue(0)
            assertThat(task.errorMessage).isEqualTo("UNKNOWN_SCHEMA_VERSION")
            assertThat(
                fixture.meterRegistry
                    .get("task.payload.quarantine")
                    .tags("taskType", taskType, "reason", "UNKNOWN_SCHEMA_VERSION")
                    .counter()
                    .count(),
            ).isEqualTo(1.0)
        } finally {
            handler.release.countDown()
            fixture.job.shutdownExecutor()
        }
    }

    private data class JobFixture(
        val job: TaskProcessingScheduledJob,
        val taskRepository: TaskRepository,
        val taskHandlerRegistry: TaskHandlerRegistry,
        val meterRegistry: SimpleMeterRegistry,
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
        workerShutdownTimeoutSeconds: Long = 5,
        lifecycleShutdownPhaseTimeout: Duration = Duration.ofSeconds(30),
        handlerEntries: List<TaskHandlerEntry> = emptyList(),
    ): JobFixture {
        val taskRepository = mock(TaskRepository::class.java)
        val taskHandlerRegistry = mock(TaskHandlerRegistry::class.java)
        val meterRegistry = SimpleMeterRegistry()
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
                clock = Clock.systemUTC(),
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
                workerShutdownTimeoutSeconds = workerShutdownTimeoutSeconds,
                lifecycleShutdownPhaseTimeout = lifecycleShutdownPhaseTimeout,
                meterRegistry = meterRegistry,
            )

        return JobFixture(job, taskRepository, taskHandlerRegistry, meterRegistry)
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

    private fun interruptAwareTaskHandlerEntry(
        taskType: String,
        handler: InterruptAwareHandler,
    ): TaskHandlerEntry =
        TaskHandlerEntry.withExactDecoders(
            taskType = taskType,
            payloadClass = StubPayload::class.java,
            handlerMethod =
                TaskHandlerMethod(
                    bean = handler,
                    method =
                        InterruptAwareHandler::class.java.getDeclaredMethod(
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

    private class InterruptAwareHandler {
        val started = CountDownLatch(1)
        val interrupted = CountDownLatch(1)

        fun handle(payload: StubPayload) {
            started.countDown()
            try {
                Thread.sleep(Long.MAX_VALUE)
            } catch (exception: InterruptedException) {
                interrupted.countDown()
                throw exception
            }
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

    private fun waitUntilQuarantineCounter(
        meterRegistry: SimpleMeterRegistry,
        taskType: String,
        reason: String,
    ) {
        repeat(40) {
            if (
                meterRegistry
                    .find("task.payload.quarantine")
                    .tags("taskType", taskType, "reason", reason)
                    .counter()
                    ?.count() == 1.0
            ) {
                return
            }
            Thread.sleep(25)
        }
    }

    private fun waitUntilNotRunning(job: TaskProcessingScheduledJob) {
        repeat(40) {
            if (!job.isRunning) return
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
