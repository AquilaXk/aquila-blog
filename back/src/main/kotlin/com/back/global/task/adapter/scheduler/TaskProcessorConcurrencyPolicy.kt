package com.back.global.task.adapter.scheduler

import kotlin.math.ceil

internal class TaskProcessorConcurrencyPolicy(
    workerConcurrency: Int,
    private val dynamicConcurrencyEnabled: Boolean,
    private val dynamicMinConcurrent: Int,
    private val dynamicBacklogPerSlot: Int,
    private val dynamicBatchSizeEnabled: Boolean,
    private val dynamicBatchMinSize: Int,
    private val dynamicBatchBacklogPerStep: Int,
    private val dynamicBatchTargetHandlerDurationMs: Long,
    private val dynamicBatchMaxPrefetchMultiplier: Int,
    private val perTypeAutoTuneEnabled: Boolean,
    private val perTypeAutoTuneMinConcurrent: Int,
) {
    val workerConcurrency: Int = workerConcurrency.coerceIn(1, 256)

    fun availableWorkerSlots(
        activeWorkers: Int,
        readyBacklog: () -> Long?,
    ): Int {
        val targetConcurrency =
            if (dynamicConcurrencyEnabled) {
                dynamicTargetConcurrency(readyBacklog())
            } else {
                workerConcurrency
            }

        return (targetConcurrency - activeWorkers.coerceAtLeast(0)).coerceIn(0, workerConcurrency)
    }

    fun fetchLimit(
        safeBatchSize: Int,
        availableWorkerSlots: Int,
        recentHandlerDurationMs: Long,
        readyBacklog: () -> Long?,
    ): Int {
        if (!dynamicBatchSizeEnabled) {
            return minOf(safeBatchSize, availableWorkerSlots)
        }

        val avgHandlerMs = recentHandlerDurationMs.coerceAtLeast(1)
        val targetMs = dynamicBatchTargetHandlerDurationMs.coerceIn(100, 60_000)
        val latencyFactor =
            when {
                avgHandlerMs <= targetMs -> 1.0
                else -> (targetMs.toDouble() / avgHandlerMs.toDouble()).coerceIn(0.35, 1.0)
            }

        val prefetchMultiplier = dynamicBatchPrefetchMultiplier(readyBacklog())
        val maxClaim = minOf(safeBatchSize, availableWorkerSlots.coerceAtLeast(1) * prefetchMultiplier)
        val minClaim = minOf(dynamicBatchMinSize.coerceIn(1, safeBatchSize), maxClaim)
        val raw =
            ceil(availableWorkerSlots.toDouble() * prefetchMultiplier.toDouble() * latencyFactor)
                .toInt()
                .coerceAtLeast(1)

        return raw.coerceIn(minClaim, maxClaim)
    }

    fun perTypeLimit(
        taskType: String,
        explicitPerTypeMaxConcurrent: Map<String, Int>,
        perTypeDynamicLimits: Map<String, Int>,
    ): Int {
        explicitPerTypeMaxConcurrent[taskType]?.let { return it.coerceIn(1, workerConcurrency) }
        if (!perTypeAutoTuneEnabled) return workerConcurrency
        return perTypeDynamicLimits[taskType] ?: perTypeAutoTuneMinConcurrent.coerceIn(1, workerConcurrency)
    }

    fun dynamicPerTypeLimits(
        registeredTaskTypes: List<String>,
        explicitPerTypeMaxConcurrent: Map<String, Int>,
    ): Map<String, Int> {
        if (!perTypeAutoTuneEnabled) return emptyMap()

        val dynamicTypes =
            registeredTaskTypes
                .distinct()
                .filterNot { explicitPerTypeMaxConcurrent.containsKey(it) }
        if (dynamicTypes.isEmpty()) return emptyMap()

        val minConcurrent = perTypeAutoTuneMinConcurrent.coerceIn(1, workerConcurrency)
        val explicitReserved = explicitPerTypeMaxConcurrent.values.sum().coerceIn(0, workerConcurrency)
        val dynamicBudget = (workerConcurrency - explicitReserved).coerceAtLeast(0)
        if (dynamicBudget == 0) return emptyMap()

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

        return desiredByType
    }

    private fun dynamicTargetConcurrency(readyBacklog: Long?): Int {
        if (readyBacklog == null) return workerConcurrency

        val minConcurrency = dynamicMinConcurrent.coerceIn(1, workerConcurrency)
        val backlogPerSlot = dynamicBacklogPerSlot.coerceAtLeast(1)
        val backlogConcurrency =
            ceil(readyBacklog.coerceAtLeast(0).toDouble() / backlogPerSlot.toDouble())
                .toInt()
                .coerceAtLeast(minConcurrency)

        return backlogConcurrency.coerceIn(minConcurrency, workerConcurrency)
    }

    private fun dynamicBatchPrefetchMultiplier(readyBacklog: Long?): Int {
        val maxPrefetchMultiplier = dynamicBatchMaxPrefetchMultiplier.coerceIn(1, 16)
        if (readyBacklog == null) return maxPrefetchMultiplier

        val backlogPerStep = dynamicBatchBacklogPerStep.coerceAtLeast(1)
        val backlogMultiplier =
            ceil(readyBacklog.coerceAtLeast(0).toDouble() / backlogPerStep.toDouble())
                .toInt()
                .coerceAtLeast(1)

        return backlogMultiplier.coerceIn(1, maxPrefetchMultiplier)
    }
}
