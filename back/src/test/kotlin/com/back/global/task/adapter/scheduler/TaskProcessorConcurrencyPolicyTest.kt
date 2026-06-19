package com.back.global.task.adapter.scheduler

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("TaskProcessorConcurrencyPolicy 테스트")
class TaskProcessorConcurrencyPolicyTest {
    @Test
    @DisplayName("dynamic concurrency off는 backlog 조회 없이 고정 worker 동시성을 사용한다")
    fun `fixed concurrency ignores ready backlog count`() {
        val policy =
            createPolicy(
                workerConcurrency = 8,
                dynamicConcurrencyEnabled = false,
            )
        var backlogCounted = false

        val slots =
            policy.availableWorkerSlots(activeWorkers = 0) {
                backlogCounted = true
                1L
            }

        assertThat(slots).isEqualTo(8)
        assertThat(backlogCounted).isFalse()
    }

    @Test
    @DisplayName("dynamic concurrency on은 backlog 증가에 따라 target worker 수를 확장한다")
    fun `dynamic concurrency expands target workers by ready backlog`() {
        val policy =
            createPolicy(
                workerConcurrency = 8,
                dynamicConcurrencyEnabled = true,
                dynamicMinConcurrent = 2,
                dynamicBacklogPerSlot = 25,
            )

        assertThat(policy.availableWorkerSlots(activeWorkers = 0) { 1L }).isEqualTo(2)
        assertThat(policy.availableWorkerSlots(activeWorkers = 0) { 200L }).isEqualTo(8)
        assertThat(policy.availableWorkerSlots(activeWorkers = 3) { 200L }).isEqualTo(5)
    }

    @Test
    @DisplayName("dynamic concurrency는 backlog 조회 실패 시 최대 worker 동시성으로 fallback한다")
    fun `dynamic concurrency falls back to max workers when ready backlog count fails`() {
        val policy =
            createPolicy(
                workerConcurrency = 8,
                dynamicConcurrencyEnabled = true,
                dynamicMinConcurrent = 2,
                dynamicBacklogPerSlot = 25,
            )

        val slots = policy.availableWorkerSlots(activeWorkers = 0) { null }

        assertThat(slots).isEqualTo(8)
    }

    @Test
    @DisplayName("dynamic batch size는 backlog step과 max prefetch multiplier를 fetch limit에 반영한다")
    fun `dynamic batch size expands fetch limit by backlog prefetch multiplier`() {
        val policy =
            createPolicy(
                workerConcurrency = 8,
                dynamicBatchBacklogPerStep = 100,
                dynamicBatchMaxPrefetchMultiplier = 3,
            )

        val fetchLimit =
            policy.fetchLimit(
                safeBatchSize = 50,
                availableWorkerSlots = 4,
                recentHandlerDurationMs = 900,
            ) {
                250L
            }

        assertThat(fetchLimit).isEqualTo(12)
    }

    @Test
    @DisplayName("per-type auto-tune은 explicit 설정을 우선하고 미지정 type은 최소 permit을 보장한다")
    fun `per type limit prefers explicit value and keeps fallback permit`() {
        val policy =
            createPolicy(
                workerConcurrency = 8,
                perTypeAutoTuneEnabled = true,
                perTypeAutoTuneMinConcurrent = 0,
            )

        assertThat(
            policy.perTypeLimit(
                taskType = "member.signupVerification.sendMail",
                explicitPerTypeMaxConcurrent = mapOf("member.signupVerification.sendMail" to 2),
                perTypeDynamicLimits = emptyMap(),
            ),
        ).isEqualTo(2)
        assertThat(
            policy.perTypeLimit(
                taskType = "post.read.prewarm",
                explicitPerTypeMaxConcurrent = emptyMap(),
                perTypeDynamicLimits = emptyMap(),
            ),
        ).isEqualTo(1)
    }

    @Test
    @DisplayName("per-type auto-tune은 등록 type별 dynamic budget을 worker concurrency 안에서 배분한다")
    fun `per type dynamic limits distribute registered task types within worker budget`() {
        val policy =
            createPolicy(
                workerConcurrency = 4,
                perTypeAutoTuneEnabled = true,
                perTypeAutoTuneMinConcurrent = 1,
            )

        val limits =
            policy.dynamicPerTypeLimits(
                registeredTaskTypes = listOf("post.search-index.sync", "post.read.prewarm"),
                explicitPerTypeMaxConcurrent = mapOf("member.signupVerification.sendMail" to 1),
            )

        assertThat(limits).containsOnlyKeys("post.search-index.sync", "post.read.prewarm")
        assertThat(limits.values.sum()).isLessThanOrEqualTo(3)
        assertThat(limits.values).allSatisfy { limit -> assertThat(limit).isGreaterThanOrEqualTo(1) }
    }

    private fun createPolicy(
        workerConcurrency: Int = 8,
        dynamicConcurrencyEnabled: Boolean = true,
        dynamicMinConcurrent: Int = 2,
        dynamicBacklogPerSlot: Int = 25,
        dynamicBatchSizeEnabled: Boolean = true,
        dynamicBatchMinSize: Int = 4,
        dynamicBatchBacklogPerStep: Int = 120,
        dynamicBatchTargetHandlerDurationMs: Long = 900,
        dynamicBatchMaxPrefetchMultiplier: Int = 2,
        perTypeAutoTuneEnabled: Boolean = true,
        perTypeAutoTuneMinConcurrent: Int = 1,
    ): TaskProcessorConcurrencyPolicy =
        TaskProcessorConcurrencyPolicy(
            workerConcurrency = workerConcurrency,
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
}
