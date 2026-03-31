package com.back.global.task.adapter.scheduler

import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.application.TaskHandlerRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.ObjectMapper

class TaskProcessingScheduledJobPerTypeLimitTest {
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

    private fun createJob(
        maxConcurrent: Int,
        perTypeMaxConcurrentRaw: String,
        perTypeAutoTuneEnabled: Boolean,
        perTypeAutoTuneMinConcurrent: Int,
    ): TaskProcessingScheduledJob =
        TaskProcessingScheduledJob(
            taskRepository = mock(TaskRepository::class.java),
            taskHandlerRegistry = mock(TaskHandlerRegistry::class.java),
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

    private fun invokeResolvePerTypeLimit(
        job: TaskProcessingScheduledJob,
        taskType: String,
    ): Int {
        val method = TaskProcessingScheduledJob::class.java.getDeclaredMethod("resolvePerTypeLimit", String::class.java)
        method.isAccessible = true
        return method.invoke(job, taskType) as Int
    }
}
