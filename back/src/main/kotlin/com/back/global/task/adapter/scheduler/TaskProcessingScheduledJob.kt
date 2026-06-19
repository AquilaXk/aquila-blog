package com.back.global.task.adapter.scheduler

import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.application.TaskExecutionContext
import com.back.global.task.application.TaskExecutionContextHolder
import com.back.global.task.application.TaskHandlerEntry
import com.back.global.task.application.TaskHandlerRegistry
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import com.back.standard.dto.TaskPayload
import io.micrometer.core.instrument.MeterRegistry
import jakarta.annotation.PreDestroy
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.ceil

/**
 * TaskProcessingScheduledJob는 주기 작업을 트리거하는 스케줄러 어댑터입니다.
 * 정기 실행 중 오류가 전체 처리 흐름으로 전파되지 않도록 실패를 격리합니다.
 */
@Component
@ConditionalOnProperty(
    prefix = "custom.runtime",
    name = ["worker-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class TaskProcessingScheduledJob(
    private val taskRepository: TaskRepository,
    private val taskHandlerRegistry: TaskHandlerRegistry,
    private val transactionTemplate: TransactionTemplate,
    private val objectMapper: ObjectMapper,
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
    @param:Value("\${custom.task.processor.perTypeAutoTuneBacklogPerSlot:20}")
    private val perTypeAutoTuneBacklogPerSlot: Int,
    @param:Value("\${custom.task.processor.perTypeAutoTuneRefreshMs:15000}")
    private val perTypeAutoTuneRefreshMs: Long,
    private val meterRegistry: MeterRegistry? = null,
) {
    private val logger = LoggerFactory.getLogger(TaskProcessingScheduledJob::class.java)
    private val workerConcurrency = maxConcurrent.coerceIn(1, 256)
    private val concurrencyGate = Semaphore(workerConcurrency)
    private val executor = Executors.newVirtualThreadPerTaskExecutor()
    private val explicitPerTypeMaxConcurrent = parsePerTypeMaxConcurrent(perTypeMaxConcurrentRaw)
    private val perTypeInFlight = ConcurrentHashMap<String, AtomicInteger>()
    private val perTypeDynamicLimits = ConcurrentHashMap<String, Int>()
    private val recentHandlerDurationMs = AtomicLong(dynamicBatchTargetHandlerDurationMs.coerceIn(100, 60_000))

    @Volatile
    private var perTypeDynamicRefreshedAtEpochMs: Long = 0

    private data class LoadedTaskExecution(
        val taskId: Long,
        val taskUid: UUID,
        val leaseToken: UUID,
        val taskType: String,
        val payload: String,
    )

    private data class TaskDispatchSlot(
        val taskId: Long,
        val leaseToken: UUID,
        val taskType: String,
    )

    /**
     * processTasks 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    @Scheduled(fixedDelayString = "\${custom.task.processor.fixedDelayMs}")
    // Queue polling is short-lived; keeping the orphan lock window tight avoids multi-hour ready backlog stalls.
    @SchedulerLock(name = "processTasks", lockAtLeastFor = "PT1M", lockAtMostFor = "PT2M")
    fun processTasks() {
        val safeBatchSize = batchSize.coerceIn(1, 500)
        recoverStaleProcessingTasks(safeBatchSize)
        refreshPerTypeDynamicLimitsIfNeeded()

        val availableWorkerSlots = resolveAvailableWorkerSlots()
        if (availableWorkerSlots <= 0) {
            logger.debug("Skip polling tasks because no worker slot is available")
            return
        }

        val fetchLimit = resolveFetchLimit(safeBatchSize, availableWorkerSlots)
        meterRegistry?.summary("task.processor.fetch.limit")?.record(fetchLimit.toDouble())
        val dispatchSlots =
            transactionTemplate.execute {
                val pendingTasks = taskRepository.findPendingTasksWithLock(fetchLimit)
                val dispatchableTasks = selectDispatchableTasks(pendingTasks, availableWorkerSlots)
                dispatchableTasks.map {
                    val leaseToken = it.markAsProcessing()
                    TaskDispatchSlot(it.id, leaseToken, it.taskType)
                }
            } ?: emptyList()

        var dispatchedWorkers = 0
        dispatchSlots.forEach { slot ->
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

            dispatchedWorkers++
            executor.submit {
                try {
                    executeTask(slot.taskId, slot.leaseToken)
                } finally {
                    releasePerTypePermit(slot.taskType)
                    concurrencyGate.release()
                }
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
        val targetConcurrency =
            if (!dynamicConcurrencyEnabled) {
                workerConcurrency
            } else {
                resolveDynamicTargetConcurrency()
            }

        return (targetConcurrency - activeWorkers).coerceIn(0, workerConcurrency)
    }

    private fun resolveDynamicTargetConcurrency(): Int {
        val readyBacklog = countReadyBacklog() ?: return workerConcurrency
        val minConcurrency = dynamicMinConcurrent.coerceIn(1, workerConcurrency)
        val backlogPerSlot = dynamicBacklogPerSlot.coerceAtLeast(1)
        val backlogConcurrency =
            ceil(readyBacklog.coerceAtLeast(0).toDouble() / backlogPerSlot.toDouble())
                .toInt()
                .coerceAtLeast(minConcurrency)

        return backlogConcurrency.coerceIn(minConcurrency, workerConcurrency)
    }

    private fun countReadyBacklog(): Long? =
        runCatching {
            taskRepository.countByStatusAndNextRetryAtLessThanEqual(TaskStatus.PENDING, Instant.now())
        }.getOrElse { exception ->
            logger.warn("Failed to count ready task backlog for dynamic concurrency; using max concurrency", exception)
            null
        }

    private fun resolveFetchLimit(
        safeBatchSize: Int,
        availableWorkerSlots: Int,
    ): Int {
        if (!dynamicBatchSizeEnabled) {
            return minOf(safeBatchSize, availableWorkerSlots)
        }

        val avgHandlerMs = recentHandlerDurationMs.get().coerceAtLeast(1)
        val targetMs = dynamicBatchTargetHandlerDurationMs.coerceIn(100, 60_000)
        val latencyFactor =
            when {
                avgHandlerMs <= targetMs -> 1.0
                else -> (targetMs.toDouble() / avgHandlerMs.toDouble()).coerceIn(0.35, 1.0)
            }

        val prefetchMultiplier = resolveDynamicBatchPrefetchMultiplier()
        val maxClaim = minOf(safeBatchSize, availableWorkerSlots.coerceAtLeast(1) * prefetchMultiplier)
        val minClaim = minOf(dynamicBatchMinSize.coerceIn(1, safeBatchSize), maxClaim)
        val raw =
            ceil(availableWorkerSlots.toDouble() * prefetchMultiplier.toDouble() * latencyFactor)
                .toInt()
                .coerceAtLeast(1)

        return raw.coerceIn(minClaim, maxClaim)
    }

    private fun resolveDynamicBatchPrefetchMultiplier(): Int {
        val maxPrefetchMultiplier = dynamicBatchMaxPrefetchMultiplier.coerceIn(1, 16)
        val backlogPerStep = dynamicBatchBacklogPerStep.coerceAtLeast(1)
        val readyBacklog = countReadyBacklog() ?: return maxPrefetchMultiplier
        val backlogMultiplier =
            ceil(readyBacklog.coerceAtLeast(0).toDouble() / backlogPerStep.toDouble())
                .toInt()
                .coerceAtLeast(1)

        return backlogMultiplier.coerceIn(1, maxPrefetchMultiplier)
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
        explicitPerTypeMaxConcurrent[taskType]?.let { return it }
        if (!perTypeAutoTuneEnabled) return workerConcurrency
        // Auto-tune refresh 지연/예산 소진으로 limit map이 비어도 task type을 영구 0 permit로 막지 않는다.
        // 전체 동시성은 worker semaphore가 제한하므로, 미지정 타입은 최소 1 슬롯으로 처리 기회를 보장한다.
        return perTypeDynamicLimits[taskType] ?: perTypeAutoTuneMinConcurrent.coerceIn(1, workerConcurrency)
    }

    private fun parsePerTypeMaxConcurrent(raw: String): Map<String, Int> =
        raw
            .split(",")
            .asSequence()
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .mapNotNull { token ->
                val parts = token.split("=", limit = 2)
                if (parts.size != 2) return@mapNotNull null
                val taskType = parts[0].trim()
                val limit = parts[1].trim().toIntOrNull()?.coerceIn(1, workerConcurrency) ?: return@mapNotNull null
                if (taskType.isBlank()) return@mapNotNull null
                taskType to limit
            }.toMap()

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

        val dynamicTypes = registeredTaskTypes.filterNot { explicitPerTypeMaxConcurrent.containsKey(it) }
        if (dynamicTypes.isEmpty()) {
            perTypeDynamicLimits.clear()
            perTypeDynamicRefreshedAtEpochMs = nowEpochMs
            return
        }

        val minConcurrent = perTypeAutoTuneMinConcurrent.coerceIn(1, workerConcurrency)
        val explicitReserved = explicitPerTypeMaxConcurrent.values.sum().coerceIn(0, workerConcurrency)
        val dynamicBudget = (workerConcurrency - explicitReserved).coerceAtLeast(0)
        if (dynamicBudget == 0) {
            perTypeDynamicLimits.clear()
            perTypeDynamicRefreshedAtEpochMs = nowEpochMs
            return
        }

        val baseLimit = (dynamicBudget / dynamicTypes.size.coerceAtLeast(1)).coerceAtLeast(minConcurrent)
        val desiredByType =
            dynamicTypes
                .associateWith { baseLimit.coerceIn(1, workerConcurrency) }
                .toMutableMap()

        while (desiredByType.values.sum() > dynamicBudget) {
            val typeToReduce = desiredByType.maxByOrNull { it.value }?.key ?: break
            val current = desiredByType[typeToReduce] ?: break
            if (current <= 1) break
            desiredByType[typeToReduce] = current - 1
        }

        perTypeDynamicLimits.clear()
        perTypeDynamicLimits.putAll(desiredByType)
        perTypeDynamicRefreshedAtEpochMs = nowEpochMs
    }

    /**
     * 만료/중단 상태를 정리해 리소스와 큐 정합성을 유지합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    private fun recoverStaleProcessingTasks(limit: Int) {
        val stuckBefore = Instant.now().minusSeconds(processingTimeoutSeconds)
        val recoveredTaskIds =
            transactionTemplate.execute {
                val staleTasks = taskRepository.findStaleProcessingTasksWithLock(stuckBefore, limit)
                staleTasks.forEach {
                    it.recoverFromStuckProcessing(
                        "Recovered stale processing task",
                        taskHandlerRegistry.getRetryPolicy(it.taskType),
                    )
                }
                staleTasks.map { it.id }
            } ?: emptyList()

        if (recoveredTaskIds.isNotEmpty()) {
            logger.warn("Recovered stale processing tasks: {}", recoveredTaskIds)
        }
    }

    private fun executeTask(
        taskId: Long,
        leaseToken: UUID,
    ) = run {
        val context = loadTaskExecutionContext(taskId, leaseToken) ?: return
        val entry = taskHandlerRegistry.getEntry(context.taskType)
        val startedAtNanos = System.nanoTime()

        if (entry == null) {
            logger.warn("No handler found for task type: {}", context.taskType)
            markTaskFailed(taskId, context.leaseToken, context.taskType, "No handler found")
            return
        }

        try {
            val payload = objectMapper.readValue(context.payload, entry.payloadClass) as TaskPayload
            invokeHandlerWithTimeout(context, entry, payload)
            markTaskCompleted(taskId, context.leaseToken, context.taskType)
            recordTaskDuration(context.taskType, startedAtNanos)
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
            logger.error("Task failed: {} (type={})", taskId, context.taskType, rootCause)
            markTaskFailed(
                taskId,
                context.leaseToken,
                context.taskType,
                rootCause.message ?: rootCause::class.simpleName,
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
            LoadedTaskExecution(task.id, task.uid, leaseToken, task.taskType, task.payload)
        }

    /**
     * 작업 상태를 전이하고 실패 시 복구 가능한 상태로 보정합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    private fun markTaskCompleted(
        taskId: Long,
        leaseToken: UUID,
        taskType: String,
    ) {
        var completed = false
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute
            if (!task.isCurrentExecution(leaseToken)) return@execute
            task.markAsCompleted()
            task.errorMessage = null
            completed = true
        }
        if (completed) {
            recordTaskResult(taskType, "success")
        }
    }

    /**
     * 작업 상태를 전이하고 실패 시 복구 가능한 상태로 보정합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
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
            task.scheduleRetry(taskHandlerRegistry.getRetryPolicy(taskType))
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
            ?.counter("task.processor.result", "taskType", safeTagValue(taskType), "status", status)
            ?.increment()
    }

    private fun recordTaskDuration(
        taskType: String,
        startedAtNanos: Long,
    ) {
        val elapsedMs = (System.nanoTime() - startedAtNanos).coerceAtLeast(0L) / 1_000_000
        updateRecentHandlerDuration(elapsedMs)
        meterRegistry
            ?.timer("task.processor.handler.duration", "taskType", safeTagValue(taskType))
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

    /**
     * 작업 상태를 전이하고 실패 시 복구 가능한 상태로 보정합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
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

    /**
     * 핸들러를 제한 시간 내 실행하고 타임아웃/예외를 분리 처리합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
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

    @PreDestroy
    fun shutdownExecutor() {
        executor.shutdown()
        if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
            executor.shutdownNow()
        }
    }
}
