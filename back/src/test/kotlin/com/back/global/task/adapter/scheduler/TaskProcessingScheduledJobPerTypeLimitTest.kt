package com.back.global.task.adapter.scheduler

import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.application.TaskHandlerEntry
import com.back.global.task.application.TaskHandlerMethod
import com.back.global.task.application.TaskHandlerRegistry
import com.back.global.task.application.TaskRetryPolicy
import com.back.standard.dto.TaskPayload
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.ObjectMapper
import java.util.UUID

class TaskProcessingScheduledJobPerTypeLimitTest {
    @Test
    @DisplayName("dynamic capacity 산정은 claim 전에 ready backlog count를 조회하지 않는다")
    fun `dynamic capacity resolution avoids ready backlog count before claim`() {
        val fixture =
            createFixture(
                maxConcurrent = 8,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = true,
                perTypeAutoTuneMinConcurrent = 1,
            )

        invokeResolveAvailableWorkerSlots(fixture.job)
        invokeResolveFetchLimit(fixture.job, safeBatchSize = 50, availableWorkerSlots = 8)

        verifyNoInteractions(fixture.taskRepository)
    }

    @Test
    @DisplayName("per-type auto-tune refresh는 task type별 ready backlog count를 조회하지 않는다")
    fun `per type auto tune refresh avoids ready backlog count by task type`() {
        val fixture =
            createFixture(
                maxConcurrent = 8,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = true,
                perTypeAutoTuneMinConcurrent = 1,
                registeredTaskTypes = listOf("post.search-index.sync", "post.read.prewarm"),
            )

        invokeRefreshPerTypeDynamicLimitsIfNeeded(fixture.job)

        verifyNoInteractions(fixture.taskRepository)
        assertThat(invokeResolvePerTypeLimit(fixture.job, "post.search-index.sync")).isGreaterThanOrEqualTo(1)
    }

    @Test
    @DisplayName("auto-tune limit map이 비어도 미지정 task type은 최소 1 permit을 보장한다")
    fun `unknown task type fallback never returns zero permit`() {
        val job =
            createJob(
                maxConcurrent = 8,
                perTypeMaxConcurrentRaw = "",
                perTypeAutoTuneEnabled = true,
                perTypeAutoTuneMinConcurrent = 0,
            )

        val resolved = invokeResolvePerTypeLimit(job, "member.signupVerification.sendMail")

        assertThat(resolved).isEqualTo(1)
    }

    @Test
    @DisplayName("명시된 per-type 설정이 있으면 auto-tune fallback보다 우선한다")
    fun `explicit per type max concurrent overrides fallback`() {
        val job =
            createJob(
                maxConcurrent = 8,
                perTypeMaxConcurrentRaw = "member.signupVerification.sendMail=2",
                perTypeAutoTuneEnabled = true,
                perTypeAutoTuneMinConcurrent = 4,
            )

        val resolved = invokeResolvePerTypeLimit(job, "member.signupVerification.sendMail")

        assertThat(resolved).isEqualTo(2)
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

    private fun createJob(
        maxConcurrent: Int,
        perTypeMaxConcurrentRaw: String,
        perTypeAutoTuneEnabled: Boolean,
        perTypeAutoTuneMinConcurrent: Int,
    ): TaskProcessingScheduledJob =
        createFixture(
            maxConcurrent = maxConcurrent,
            perTypeMaxConcurrentRaw = perTypeMaxConcurrentRaw,
            perTypeAutoTuneEnabled = perTypeAutoTuneEnabled,
            perTypeAutoTuneMinConcurrent = perTypeAutoTuneMinConcurrent,
        ).job

    private fun createFixture(
        maxConcurrent: Int,
        perTypeMaxConcurrentRaw: String,
        perTypeAutoTuneEnabled: Boolean,
        perTypeAutoTuneMinConcurrent: Int,
        registeredTaskTypes: List<String> = emptyList(),
    ): JobFixture {
        val taskRepository = mock(TaskRepository::class.java)
        val taskHandlerRegistry = mock(TaskHandlerRegistry::class.java)
        if (registeredTaskTypes.isNotEmpty()) {
            org.mockito.Mockito
                .`when`(taskHandlerRegistry.getRegisteredEntries())
                .thenReturn(registeredTaskTypes.map { taskType -> taskHandlerEntry(taskType) })
        }

        val job =
            TaskProcessingScheduledJob(
                taskRepository = taskRepository,
                taskHandlerRegistry = taskHandlerRegistry,
                transactionTemplate = TransactionTemplate(mock(PlatformTransactionManager::class.java)),
                objectMapper = ObjectMapper(),
                batchSize = 50,
                processingTimeoutSeconds = 900,
                maxConcurrent = maxConcurrent,
                handlerTimeoutSeconds = 120,
                dynamicConcurrencyEnabled = true,
                dynamicMinConcurrent = 2,
                dynamicBacklogPerSlot = 25,
                dynamicBatchSizeEnabled = true,
                dynamicBatchMinSize = 4,
                dynamicBatchBacklogPerStep = 120,
                dynamicBatchTargetHandlerDurationMs = 900,
                dynamicBatchMaxPrefetchMultiplier = 2,
                perTypeMaxConcurrentRaw = perTypeMaxConcurrentRaw,
                perTypeAutoTuneEnabled = perTypeAutoTuneEnabled,
                perTypeAutoTuneMinConcurrent = perTypeAutoTuneMinConcurrent,
                perTypeAutoTuneBacklogPerSlot = 20,
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

    @Suppress("unused")
    private fun handleStubPayload(payload: StubPayload) = Unit

    private fun invokeResolveAvailableWorkerSlots(job: TaskProcessingScheduledJob): Int {
        val method = TaskProcessingScheduledJob::class.java.getDeclaredMethod("resolveAvailableWorkerSlots")
        method.isAccessible = true
        return method.invoke(job) as Int
    }

    private fun invokeResolveFetchLimit(
        job: TaskProcessingScheduledJob,
        safeBatchSize: Int,
        availableWorkerSlots: Int,
    ): Int {
        val method =
            TaskProcessingScheduledJob::class.java.getDeclaredMethod(
                "resolveFetchLimit",
                Int::class.javaPrimitiveType,
                Int::class.javaPrimitiveType,
            )
        method.isAccessible = true
        return method.invoke(job, safeBatchSize, availableWorkerSlots) as Int
    }

    private fun invokeRefreshPerTypeDynamicLimitsIfNeeded(job: TaskProcessingScheduledJob) {
        val method = TaskProcessingScheduledJob::class.java.getDeclaredMethod("refreshPerTypeDynamicLimitsIfNeeded")
        method.isAccessible = true
        method.invoke(job)
    }

    private fun invokeResolvePerTypeLimit(
        job: TaskProcessingScheduledJob,
        taskType: String,
    ): Int {
        val method = TaskProcessingScheduledJob::class.java.getDeclaredMethod("resolvePerTypeLimit", String::class.java)
        method.isAccessible = true
        return method.invoke(job, taskType) as Int
    }
}
