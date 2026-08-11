package com.back.global.task.adapter.scheduler

import com.back.global.task.application.TaskRetentionCleanupResult
import com.back.global.task.application.TaskRetentionService
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.mockito.Mockito.times

class TaskRetentionCleanupScheduledJobTest {
    @Test
    fun `cleanup job은 bounded batch를 반복하고 처리 결과를 기록한다`() {
        val service = mock(TaskRetentionService::class.java)
        given(service.cleanupBatch(1))
            .willReturn(
                TaskRetentionCleanupResult(redactedPayloadCount = 1, purgedRowCount = 1),
                TaskRetentionCleanupResult(redactedPayloadCount = 0, purgedRowCount = 0),
            )
        val job =
            TaskRetentionCleanupScheduledJob(
                taskRetentionService = service,
                cleanupBatchSize = 0,
                cleanupMaxBatches = 2,
            )

        job.cleanup()

        then(service).should(times(2)).cleanupBatch(1)
    }
}
