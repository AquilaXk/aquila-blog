package com.back.global.task.adapter.scheduler

import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.application.StoredTaskPayloadMetadata
import com.back.global.task.application.TaskExecutionContext
import com.back.global.task.application.TaskExecutionContextHolder
import com.back.global.task.application.TaskHandlerEntry
import com.back.global.task.application.TaskHandlerRegistry
import com.back.global.task.application.TaskPayloadEnvelopeCodec
import com.back.global.task.application.TaskPayloadQuarantineException
import com.back.global.task.application.TaskQuarantineReason
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import com.back.standard.dto.TaskPayload
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import jakarta.annotation.PreDestroy
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.ApplicationListener
import org.springframework.context.SmartLifecycle
import org.springframework.context.event.ContextClosedEvent
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.locks.ReentrantLock

private const val MAX_CONFIGURED_PER_TYPE_CONCURRENT = 256

@Component
@ConditionalOnProperty(
    prefix = "custom.runtime",
    name = ["worker-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
@ConditionalOnProperty(
    prefix = "custom.task.processor",
    name = ["enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class TaskProcessingScheduledJob(
    private val taskRepository: TaskRepository,
    private val taskHandlerRegistry: TaskHandlerRegistry,
    private val taskPayloadEnvelopeCodec: TaskPayloadEnvelopeCodec,
    private val clock: Clock,
    private val transactionTemplate: TransactionTemplate,
    @param:Value("\${custom.task.processor.batchSize:50}")
    private val batchSize: Int,
    @param:Value("\${custom.task.processor.processingTimeoutSeconds:900}")
    private val processingTimeoutSeconds: Long,
    @param:Value("\${custom.task.processor.maxConcurrent:8}")
    private val maxConcurrent: Int,
    @param:Value("\${custom.task.processor.handlerTimeoutSeconds:120}")
    private val handlerTimeoutSeconds: Long,
    @param:Value("\${custom.task.processor.dynamicConcurrencyEnabled:true}")
    private val dynamicConcurrencyEnabled: Boolean,
    @param:Value("\${custom.task.processor.dynamicMinConcurrent:2}")
    private val dynamicMinConcurrent: Int,
    @param:Value("\${custom.task.processor.dynamicBacklogPerSlot:25}")
    private val dynamicBacklogPerSlot: Int,
    @param:Value("\${custom.task.processor.dynamicBatchSizeEnabled:true}")
    private val dynamicBatchSizeEnabled: Boolean,
    @param:Value("\${custom.task.processor.dynamicBatchMinSize:4}")
    private val dynamicBatchMinSize: Int,
    @param:Value("\${custom.task.processor.dynamicBatchBacklogPerStep:120}")
    private val dynamicBatchBacklogPerStep: Int,
    @param:Value("\${custom.task.processor.dynamicBatchTargetHandlerDurationMs:900}")
    private val dynamicBatchTargetHandlerDurationMs: Long,
    @param:Value("\${custom.task.processor.dynamicBatchMaxPrefetchMultiplier:2}")
    private val dynamicBatchMaxPrefetchMultiplier: Int,
    @Value("\${custom.task.processor.perTypeMaxConcurrent:}")
    perTypeMaxConcurrentRaw: String,
    @param:Value("\${custom.task.processor.perTypeAutoTuneEnabled:true}")
    private val perTypeAutoTuneEnabled: Boolean,
    @param:Value("\${custom.task.processor.perTypeAutoTuneMinConcurrent:1}")
    private val perTypeAutoTuneMinConcurrent: Int,
    @param:Value("\${custom.task.processor.perTypeAutoTuneRefreshMs:15000}")
    private val perTypeAutoTuneRefreshMs: Long,
    @param:Value("\${custom.task.processor.shutdownTimeoutSeconds}")
    private val workerShutdownTimeoutSeconds: Long,
    @param:Value("\${spring.lifecycle.timeout-per-shutdown-phase}")
    private val lifecycleShutdownPhaseTimeout: Duration,
    private val meterRegistry: MeterRegistry? = null,
) : SmartLifecycle,
    ApplicationListener<ContextClosedEvent> {
    private val logger = LoggerFactory.getLogger(TaskProcessingScheduledJob::class.java)
    private val concurrencyPolicy =
        TaskProcessorConcurrencyPolicy(
            workerConcurrency = maxConcurrent,
            dynamicConcurrencyEnabled = dynamicConcurrencyEnabled,
            dynamicMinConcurrent = dynamicMinConcurrent,
            dynamicBacklogPerSlot = dynamicBacklogPerSlot,
            dynamicBatchSizeEnabled = dynamicBatchSizeEnabled,
            dynamicBatchMinSize = dynamicBatchMinSize,
            dynamicBatchBacklogPerStep = dynamicBatchBacklogPerStep,
            dynamicBatchTargetHandlerDurationMs = dynamicBatchTargetHandlerDurationMs,
            dynamicBatchMaxPrefetchMultiplier = dynamicBatchMaxPrefetchMultiplier,
            perTypeAutoTuneEnabled = perTypeAutoTuneEnabled,
            perTypeAutoTuneMinConcurrent = perTypeAutoTuneMinConcurrent,
        )
    private val workerConcurrency = concurrencyPolicy.workerConcurrency
    private val concurrencyGate = Semaphore(workerConcurrency)
    private val executor = Executors.newVirtualThreadPerTaskExecutor()
    private val explicitPerTypeMaxConcurrent = parsePerTypeMaxConcurrent(perTypeMaxConcurrentRaw)
    private val perTypeInFlight = ConcurrentHashMap<String, AtomicInteger>()
    private val perTypeDynamicLimits = ConcurrentHashMap<String, Int>()
    private val recentHandlerDurationMs = AtomicLong(dynamicBatchTargetHandlerDurationMs.coerceIn(100, 60_000))
    private val queueAvailable = AtomicLong(0)
    private val lifecycleLock = ReentrantLock()

    private val running = AtomicBoolean(true)
    private val acceptingClaims = AtomicBoolean(true)
    private val drainStarted = AtomicBoolean(false)
    private val drainCompleted = CountDownLatch(1)
    private val drainTerminated = AtomicBoolean(false)

    init {
        require(workerShutdownTimeoutSeconds > 0 && lifecycleShutdownPhaseTimeout > Duration.ofSeconds(workerShutdownTimeoutSeconds)) {
            "custom.task.processor.shutdownTimeoutSeconds must be positive and shorter than spring.lifecycle.timeout-per-shutdown-phase"
        }
        meterRegistry?.let { registry ->
            Gauge.builder("task.processor.queue.available") { queueAvailable.get().toDouble() }.register(registry)
        }
    }

    @Volatile
    private var perTypeDynamicRefreshedAtEpochMs: Long = 0

    private data class LoadedTaskExecution(
        val taskId: Long,
        val taskUid: UUID,
        val leaseToken: UUID,
        val aggregateType: String,
        val aggregateId: Long,
        val taskType: String,
        val payload: String,
    )

    private data class TaskDispatchSlot(
        val taskId: Long,
        val leaseToken: UUID,
        val taskType: String,
    )

    private data class StaleTaskRecoveryResult(
        val taskIds: List<Long>,
        val quarantinedTaskTypes: List<String>,
    )

    @Scheduled(fixedDelayString = "\${custom.task.processor.fixedDelayMs}")
    // Queue polling is short-lived; keeping the orphan lock window tight avoids multi-hour ready backlog stalls.
    @SchedulerLock(name = "processTasks", lockAtLeastFor = "PT1M", lockAtMostFor = "PT2M")
    fun processTasks() {
        lifecycleLock.lock()
        try {
            if (!canClaimTasks()) return
            try {
                processTasksOnce()
            } catch (exception: RuntimeException) {
                recordQueueUnavailable(exception)
            }
        } finally {
            lifecycleLock.unlock()
        }
    }

    private fun processTasksOnce() {
        val safeBatchSize = batchSize.coerceIn(1, 500)
        recoverStaleProcessingTasks(safeBatchSize)
        refreshPerTypeDynamicLimitsIfNeeded()

        val availableWorkerSlots = resolveAvailableWorkerSlots()
        if (availableWorkerSlots <= 0) {
            queueAvailable.set(1)
            logger.debug("Skip polling tasks because no worker slot is available")
            return
        }

        val fetchLimit = resolveFetchLimit(safeBatchSize, availableWorkerSlots)
        queueAvailable.set(1)
        meterRegistry?.summary("task.processor.fetch.limit")?.record(fetchLimit.toDouble())
        val dispatchSlots =
            transactionTemplate.execute {
                val pendingTasks = taskRepository.findPendingTasksWithLock(fetchLimit)
                if (!canClaimTasks()) return@execute emptyList()
                val dispatchableTasks = selectDispatchableTasks(pendingTasks, availableWorkerSlots)
                dispatchableTasks.map {
                    val leaseToken = it.markAsProcessing()
                    TaskDispatchSlot(it.id, leaseToken, it.taskType)
                }
            }

        var dispatchedWorkers = 0
        dispatchSlots.forEach { slot ->
            if (!canClaimTasks()) {
                revertTaskToPending(slot.taskId, slot.leaseToken)
                return@forEach
            }
            if (dispatchedWorkers >= availableWorkerSlots) {
                revertTaskToPending(slot.taskId, slot.leaseToken)
                return@forEach
            }
            if (!concurrencyGate.tryAcquire()) {
                revertTaskToPending(slot.taskId, slot.leaseToken)
                return@forEach
            }
            if (!tryAcquirePerTypePermit(slot.taskType)) {
                concurrencyGate.release()
                revertTaskToPending(slot.taskId, slot.leaseToken)
                return@forEach
            }

            try {
                executor.submit {
                    try {
                        executeTask(slot.taskId, slot.leaseToken)
                    } finally {
                        releasePerTypePermit(slot.taskType)
                        concurrencyGate.release()
                    }
                }
                dispatchedWorkers++
            } catch (exception: RejectedExecutionException) {
                releasePerTypePermit(slot.taskType)
                concurrencyGate.release()
                revertTaskToPending(slot.taskId, slot.leaseToken)
            }
        }
    }

    private fun selectDispatchableTasks(
        pendingTasks: List<Task>,
        availableWorkerSlots: Int,
    ): List<Task> {
        val projectedPerType = mutableMapOf<String, Int>()
        val dispatchableTasks = mutableListOf<Task>()

        for (task in pendingTasks) {
            if (dispatchableTasks.size >= availableWorkerSlots) break
            val projectedInFlight = projectedPerType[task.taskType] ?: 0
            if (!canReservePerTypeSlot(task.taskType, projectedInFlight)) continue

            projectedPerType[task.taskType] = projectedInFlight + 1
            dispatchableTasks += task
        }

        return dispatchableTasks
    }

    private fun canReservePerTypeSlot(
        taskType: String,
        projectedInFlight: Int,
    ): Boolean {
        val maxAllowed = resolvePerTypeLimit(taskType)
        if (maxAllowed <= 0) return false
        val currentInFlight = perTypeInFlight[taskType]?.get() ?: 0
        return currentInFlight + projectedInFlight < maxAllowed
    }

    private fun resolveAvailableWorkerSlots(): Int {
        val activeWorkers = (workerConcurrency - concurrencyGate.availablePermits()).coerceAtLeast(0)
        return concurrencyPolicy.availableWorkerSlots(activeWorkers) { countReadyBacklog() }
    }

    private fun countReadyBacklog(): Long = taskRepository.countByStatusAndNextRetryAtLessThanEqual(TaskStatus.PENDING, Instant.now(clock))

    private fun recordQueueUnavailable(exception: RuntimeException) {
        queueAvailable.set(0)
        meterRegistry?.counter("task.processor.queue.errors")?.increment()
        val errorType = exception::class.qualifiedName ?: "TaskQueueUnavailable"
        logger.error("Abort task poll because ready backlog is unavailable: errorType={}", errorType)
    }

    private fun resolveFetchLimit(
        safeBatchSize: Int,
        availableWorkerSlots: Int,
    ): Int =
        concurrencyPolicy.fetchLimit(
            safeBatchSize = safeBatchSize,
            availableWorkerSlots = availableWorkerSlots,
            recentHandlerDurationMs = recentHandlerDurationMs.get(),
        ) {
            countReadyBacklog()
        }

    private fun tryAcquirePerTypePermit(taskType: String): Boolean {
        val maxAllowed = resolvePerTypeLimit(taskType)
        if (maxAllowed <= 0) return false

        val inFlight = perTypeInFlight.computeIfAbsent(taskType) { AtomicInteger(0) }
        while (true) {
            val current = inFlight.get()
            if (current >= maxAllowed) return false
            if (inFlight.compareAndSet(current, current + 1)) {
                return true
            }
        }
    }

    private fun releasePerTypePermit(taskType: String) {
        val inFlight = perTypeInFlight[taskType] ?: return
        while (true) {
            val current = inFlight.get()
            if (current <= 0) return
            if (inFlight.compareAndSet(current, current - 1)) {
                return
            }
        }
    }

    private fun resolvePerTypeLimit(taskType: String): Int {
        // Auto-tune refresh 지연/예산 소진으로 limit map이 비어도 task type을 영구 0 permit로 막지 않는다.
        // 전체 동시성은 worker semaphore가 제한하므로, 미지정 타입은 최소 1 슬롯으로 처리 기회를 보장한다.
        return concurrencyPolicy.perTypeLimit(taskType, explicitPerTypeMaxConcurrent, perTypeDynamicLimits)
    }

    private fun parsePerTypeMaxConcurrent(raw: String): Map<String, Int> {
        if (raw.isBlank()) return emptyMap()
        val parsed = linkedMapOf<String, Int>()
        raw.split(",").forEach { rawToken ->
            val token = rawToken.trim()
            val parts = token.split("=", limit = 2)
            require(parts.size == 2) {
                "custom.task.processor.perTypeMaxConcurrent entry must use taskType=limit: '$token'"
            }
            val taskType = parts[0].trim()
            val limit = parts[1].trim().toIntOrNull()
            require(taskType.isNotBlank() && limit != null && limit in 1..MAX_CONFIGURED_PER_TYPE_CONCURRENT) {
                "custom.task.processor.perTypeMaxConcurrent entry is invalid: '$token'"
            }
            require(parsed.putIfAbsent(taskType, limit) == null) {
                "custom.task.processor.perTypeMaxConcurrent contains duplicate taskType: '$taskType'"
            }
        }
        return parsed
    }

    private fun refreshPerTypeDynamicLimitsIfNeeded() {
        if (!perTypeAutoTuneEnabled) return

        val nowEpochMs = System.currentTimeMillis()
        val refreshWindowMs = perTypeAutoTuneRefreshMs.coerceIn(1_000, 300_000)
        if (nowEpochMs - perTypeDynamicRefreshedAtEpochMs < refreshWindowMs) return

        val registeredTaskTypes =
            taskHandlerRegistry
                .getRegisteredEntries()
                .map { it.taskType }
                .distinct()
        if (registeredTaskTypes.isEmpty()) return

        val desiredByType =
            concurrencyPolicy.dynamicPerTypeLimits(
                registeredTaskTypes = registeredTaskTypes,
                explicitPerTypeMaxConcurrent = explicitPerTypeMaxConcurrent,
            )
        if (desiredByType.isEmpty()) {
            perTypeDynamicLimits.clear()
            perTypeDynamicRefreshedAtEpochMs = nowEpochMs
            return
        }

        perTypeDynamicLimits.clear()
        perTypeDynamicLimits.putAll(desiredByType)
        perTypeDynamicRefreshedAtEpochMs = nowEpochMs
    }

    private fun recoverStaleProcessingTasks(limit: Int) {
        val now = Instant.now(clock)
        val stuckBefore = now.minusSeconds(processingTimeoutSeconds)
        val recoveryResult =
            checkNotNull(
                transactionTemplate.execute {
                    val staleTasks = taskRepository.findStaleProcessingTasksWithLock(stuckBefore, limit)
                    val quarantinedTaskTypes = mutableListOf<String>()
                    staleTasks.forEach {
                        val entry = taskHandlerRegistry.getEntry(it.taskType)
                        if (entry == null) {
                            it.markAsQuarantined(TaskQuarantineReason.UNKNOWN_TASK_TYPE.name, now)
                            quarantinedTaskTypes += it.taskType
                        } else {
                            it.recoverFromStuckProcessing(
                                "Recovered stale processing task",
                                entry.retryPolicy,
                                now,
                            )
                        }
                    }
                    StaleTaskRecoveryResult(
                        taskIds = staleTasks.map { it.id },
                        quarantinedTaskTypes = quarantinedTaskTypes,
                    )
                },
            ) { "Stale task recovery transaction returned no result" }

        recoveryResult.quarantinedTaskTypes.forEach { taskType ->
            recordTaskQuarantine(taskType, TaskQuarantineReason.UNKNOWN_TASK_TYPE)
        }
        if (recoveryResult.taskIds.isNotEmpty()) {
            logger.warn("Recovered stale processing tasks: {}", recoveryResult.taskIds)
        }
    }

    private fun executeTask(
        taskId: Long,
        leaseToken: UUID,
    ) {
        val context = loadTaskExecutionContext(taskId, leaseToken) ?: return
        val entry = taskHandlerRegistry.getEntry(context.taskType)
        val startedAtNanos = System.nanoTime()

        if (entry == null) {
            logger.warn("No handler found for task type: {}", context.taskType)
            markTaskQuarantined(
                taskId,
                context.leaseToken,
                context.taskType,
                TaskQuarantineReason.UNKNOWN_TASK_TYPE,
            )
            return
        }

        try {
            val payload =
                taskPayloadEnvelopeCodec.decode(
                    rawEnvelope = context.payload,
                    storedMetadata =
                        StoredTaskPayloadMetadata(
                            uid = context.taskUid,
                            aggregateType = context.aggregateType,
                            aggregateId = context.aggregateId,
                            taskType = context.taskType,
                        ),
                    entry = entry,
                )
            invokeHandlerWithTimeout(context, entry, payload)
            markTaskCompleted(taskId, context.leaseToken, context.taskType)
            recordTaskDuration(context.taskType, startedAtNanos)
        } catch (exception: TaskPayloadQuarantineException) {
            logger.warn(
                "task_payload_quarantined taskId={} taskType={} reason={}",
                taskId,
                context.taskType,
                exception.reason,
            )
            markTaskQuarantined(taskId, context.leaseToken, context.taskType, exception.reason)
        } catch (exception: TimeoutException) {
            logger.error(
                "Task handler timeout: {} (type={}, timeoutSeconds={})",
                taskId,
                context.taskType,
                handlerTimeoutSeconds,
            )
            markTaskFailed(
                taskId,
                context.leaseToken,
                context.taskType,
                "Task handler timed out after ${handlerTimeoutSeconds}s",
            )
            recordTaskDuration(context.taskType, startedAtNanos)
        } catch (exception: Exception) {
            val rootCause = exception.cause ?: exception
            val errorType = rootCause::class.qualifiedName ?: "TaskHandlerFailure"
            logger.error("Task failed: {} (type={}, errorType={})", taskId, context.taskType, errorType)
            markTaskFailed(
                taskId,
                context.leaseToken,
                context.taskType,
                errorType,
            )
            recordTaskDuration(context.taskType, startedAtNanos)
        }
    }

    private fun loadTaskExecutionContext(
        taskId: Long,
        leaseToken: UUID,
    ): LoadedTaskExecution? =
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute null
            if (!task.isCurrentExecution(leaseToken)) return@execute null
            LoadedTaskExecution(
                taskId = task.id,
                taskUid = task.uid,
                leaseToken = leaseToken,
                aggregateType = task.aggregateType,
                aggregateId = task.aggregateId,
                taskType = task.taskType,
                payload = task.payload,
            )
        }

    private fun markTaskQuarantined(
        taskId: Long,
        leaseToken: UUID,
        taskType: String,
        reason: TaskQuarantineReason,
    ) {
        var quarantined = false
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute
            if (!task.isCurrentExecution(leaseToken)) return@execute
            task.markAsQuarantined(reason.name, Instant.now(clock))
            quarantined = true
        }
        if (quarantined) {
            recordTaskQuarantine(taskType, reason)
            recordTaskResult(taskType, "quarantine")
        }
    }

    private fun markTaskCompleted(
        taskId: Long,
        leaseToken: UUID,
        taskType: String,
    ) {
        var completed = false
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute
            if (!task.isCurrentExecution(leaseToken)) return@execute
            task.markAsCompleted(Instant.now(clock))
            task.errorMessage = null
            completed = true
        }
        if (completed) {
            recordTaskResult(taskType, "success")
        }
    }

    private fun markTaskFailed(
        taskId: Long,
        leaseToken: UUID,
        taskType: String,
        errorMessage: String?,
    ) {
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute
            if (!task.isCurrentExecution(leaseToken)) return@execute
            task.errorMessage = errorMessage
            task.scheduleRetry(taskHandlerRegistry.getRetryPolicy(taskType), Instant.now(clock))
            if (task.status == TaskStatus.FAILED) {
                logger.error(
                    "task_dead_lettered taskId={} taskType={} retryCount={} maxRetries={}",
                    task.id,
                    taskType,
                    task.retryCount,
                    task.maxRetries,
                )
            }
            recordTaskResult(taskType, if (task.status == TaskStatus.FAILED) "dlq" else "retry")
        }
    }

    private fun recordTaskResult(
        taskType: String,
        status: String,
    ) {
        meterRegistry
            ?.counter("task.processor.result", "taskType", metricTaskType(taskType), "status", status)
            ?.increment()
    }

    private fun recordTaskQuarantine(
        taskType: String,
        reason: TaskQuarantineReason,
    ) {
        meterRegistry
            ?.counter(
                "task.payload.quarantine",
                "taskType",
                metricTaskType(taskType),
                "reason",
                reason.name,
            )?.increment()
    }

    private fun recordTaskDuration(
        taskType: String,
        startedAtNanos: Long,
    ) {
        val elapsedMs = (System.nanoTime() - startedAtNanos).coerceAtLeast(0L) / 1_000_000
        updateRecentHandlerDuration(elapsedMs)
        meterRegistry
            ?.timer("task.processor.handler.duration", "taskType", metricTaskType(taskType))
            ?.record(elapsedMs, TimeUnit.MILLISECONDS)
    }

    private fun updateRecentHandlerDuration(elapsedMs: Long) {
        if (elapsedMs <= 0L) return
        recentHandlerDurationMs.getAndUpdate { previous ->
            val safePrevious = previous.coerceAtLeast(elapsedMs)
            (((safePrevious * 8) + (elapsedMs * 2)) / 10).coerceAtLeast(1L)
        }
    }

    private fun safeTagValue(raw: String): String {
        val sanitized = raw.trim().replace(Regex("[^a-zA-Z0-9._-]"), "_")
        return sanitized.take(80).ifBlank { "unknown" }
    }

    private fun metricTaskType(taskType: String): String =
        if (taskHandlerRegistry.getEntry(taskType) == null) "unregistered" else safeTagValue(taskType)

    private fun revertTaskToPending(
        taskId: Long,
        leaseToken: UUID,
    ) {
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute
            if (!task.isCurrentExecution(leaseToken)) return@execute
            task.status = TaskStatus.PENDING
            task.clearProcessingLease()
        }
    }

    private fun invokeHandlerWithTimeout(
        context: LoadedTaskExecution,
        entry: TaskHandlerEntry,
        payload: TaskPayload,
    ) {
        val timeoutSeconds = handlerTimeoutSeconds.coerceIn(5, 3600)
        val handlerContext =
            TaskExecutionContext(
                taskId = context.taskId,
                taskUid = context.taskUid,
                taskType = context.taskType,
                executionLeaseToken = context.leaseToken,
                idempotencyKey = context.taskUid.toString(),
            )
        val future =
            executor.submit<Unit> {
                TaskExecutionContextHolder.withContext(handlerContext) {
                    entry.handlerMethod.method.invoke(entry.handlerMethod.bean, payload)
                }
            }

        try {
            future.get(timeoutSeconds, TimeUnit.SECONDS)
        } catch (timeout: TimeoutException) {
            future.cancel(true)
            throw timeout
        } catch (executionException: ExecutionException) {
            val cause = executionException.cause
            if (cause is Exception) throw cause
            logger.error(
                "Task handler failed with non-exception throwable (taskId={}, taskType={})",
                context.taskId,
                context.taskType,
                cause,
            )
            throw RuntimeException(cause)
        } catch (interruptedException: InterruptedException) {
            Thread.currentThread().interrupt()
            logger.warn(
                "Task worker interrupted while executing handler (taskId={}, taskType={})",
                context.taskId,
                context.taskType,
            )
            throw interruptedException
        }
    }

    override fun start() = Unit

    override fun onApplicationEvent(event: ContextClosedEvent) {
        acceptingClaims.set(false)
        lifecycleLock.lock()
        lifecycleLock.unlock()
    }

    override fun stop() {
        val deadlines =
            beginDrain()
                ?: run {
                    awaitDrainCompletion()
                    return
                }
        completeDrain(deadlines)
    }

    override fun stop(callback: Runnable) {
        val deadlines = beginDrain()
        Thread.ofVirtual().start {
            val terminated = deadlines?.let(::completeDrain) ?: awaitDrainCompletion()
            if (terminated) callback.run()
        }
    }

    private fun beginDrain(): DrainDeadlines? {
        if (!drainStarted.compareAndSet(false, true)) return null
        running.set(false)
        return DrainDeadlines(
            workerDeadlineNanos = System.nanoTime() + TimeUnit.SECONDS.toNanos(workerShutdownTimeoutSeconds),
            phaseDeadlineNanos = System.nanoTime() + lifecycleShutdownPhaseTimeout.toNanos(),
        )
    }

    private fun completeDrain(deadlines: DrainDeadlines): Boolean {
        val pollReleased = awaitInFlightPoll(deadlines.workerDeadlineNanos)
        val terminated = awaitWorkerTermination(deadlines.workerDeadlineNanos, deadlines.phaseDeadlineNanos, pollReleased)
        drainTerminated.set(terminated)
        drainCompleted.countDown()
        return terminated
    }

    override fun isRunning(): Boolean = running.get()

    override fun isAutoStartup(): Boolean = true

    override fun getPhase(): Int = 0

    @PreDestroy
    fun shutdownExecutor() = stop()

    private fun canClaimTasks(): Boolean = running.get() && acceptingClaims.get()

    private fun awaitDrainCompletion(): Boolean {
        return try {
            if (!drainCompleted.await(lifecycleShutdownPhaseTimeout.toNanos(), TimeUnit.NANOSECONDS)) return false
            drainTerminated.get()
        } catch (interruptedException: InterruptedException) {
            Thread.currentThread().interrupt()
            false
        }
    }

    private fun awaitWorkerTermination(
        workerDeadlineNanos: Long,
        phaseDeadlineNanos: Long,
        pollReleased: Boolean,
    ): Boolean {
        val timeoutSeconds = workerShutdownTimeoutSeconds
        try {
            if (pollReleased && awaitActiveWorkers(workerDeadlineNanos)) {
                executor.shutdown()
                val remainingNanos = (workerDeadlineNanos - System.nanoTime()).coerceAtLeast(0)
                if (executor.awaitTermination(remainingNanos, TimeUnit.NANOSECONDS)) {
                    logger.info("Task worker drain completed within {}s", timeoutSeconds)
                    return true
                }
            }
            meterRegistry?.counter("task.processor.shutdown.timeouts")?.increment()
            logger.error("Task worker drain timed out after {}s; interrupting active workers", timeoutSeconds)
            executor.shutdownNow()
            val remainingPhaseNanos = (phaseDeadlineNanos - System.nanoTime()).coerceAtLeast(0)
            if (executor.awaitTermination(remainingPhaseNanos, TimeUnit.NANOSECONDS)) {
                logger.error("Task worker forced cleanup completed without graceful drain")
                return false
            }
            logger.error("Task worker did not terminate before lifecycle phase timeout")
            return false
        } catch (interruptedException: InterruptedException) {
            Thread.currentThread().interrupt()
            logger.error("Task worker drain interrupted; interrupting active workers")
            executor.shutdownNow()
            return false
        }
    }

    private fun awaitActiveWorkers(deadlineNanos: Long): Boolean {
        while (concurrencyGate.availablePermits() != workerConcurrency) {
            val remainingNanos = deadlineNanos - System.nanoTime()
            if (remainingNanos <= 0) return false
            TimeUnit.NANOSECONDS.sleep(remainingNanos.coerceAtMost(TimeUnit.MILLISECONDS.toNanos(25)))
        }
        return true
    }

    private fun awaitInFlightPoll(deadlineNanos: Long): Boolean {
        val remainingNanos = deadlineNanos - System.nanoTime()
        if (remainingNanos <= 0) return false
        return try {
            lifecycleLock.tryLock(remainingNanos, TimeUnit.NANOSECONDS).also { acquired ->
                if (acquired) lifecycleLock.unlock()
            }
        } catch (interruptedException: InterruptedException) {
            Thread.currentThread().interrupt()
            false
        }
    }

    private data class DrainDeadlines(
        val workerDeadlineNanos: Long,
        val phaseDeadlineNanos: Long,
    )
}
