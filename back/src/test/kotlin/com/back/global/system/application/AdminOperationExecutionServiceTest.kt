package com.back.global.system.application

import com.back.global.system.adapter.persistence.AdminOperationReceiptRepository
import com.back.global.system.model.AdminOperationAction
import com.back.global.system.model.AdminOperationReceipt
import com.back.global.system.model.AdminOperationResultCode
import com.back.global.system.model.AdminOperationStatus
import com.back.global.task.application.TaskDlqReplayResult
import com.back.global.task.application.TaskDlqReplayService
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import java.time.Instant
import java.util.UUID

class AdminOperationExecutionServiceTest {
    private val receiptRepository = mock(AdminOperationReceiptRepository::class.java)
    private val taskDlqReplayService = mock(TaskDlqReplayService::class.java)
    private val service = AdminOperationExecutionService(receiptRepository, taskDlqReplayService)

    @Test
    fun `all quarantined tasks persist failed terminal result`() {
        val receipt = receipt()
        `when`(receiptRepository.findByOperationIdWithLock(receipt.operationId)).thenReturn(receipt)
        `when`(taskDlqReplayService.replayFailedTasksWithLock(null, 50, true))
            .thenReturn(replay(selected = 2, replayed = 0, quarantined = 2))

        val result = service.execute(receipt.operationId)

        assertThat(result.status).isEqualTo(AdminOperationStatus.FAILED)
        assertThat(result.resultCode).isEqualTo(AdminOperationResultCode.ALL_TASKS_QUARANTINED)
        assertThat(result.selectedCount).isEqualTo(2)
        assertThat(result.replayedCount).isZero()
        assertThat(result.quarantinedCount).isEqualTo(2)
    }

    @Test
    fun `mixed replay and quarantine persist partial terminal result`() {
        val receipt = receipt()
        `when`(receiptRepository.findByOperationIdWithLock(receipt.operationId)).thenReturn(receipt)
        `when`(taskDlqReplayService.replayFailedTasksWithLock(null, 50, true))
            .thenReturn(replay(selected = 3, replayed = 2, quarantined = 1))

        val result = service.execute(receipt.operationId)

        assertThat(result.status).isEqualTo(AdminOperationStatus.PARTIAL)
        assertThat(result.resultCode).isEqualTo(AdminOperationResultCode.TASKS_PARTIALLY_REPLAYED)
        assertThat(result.selectedCount).isEqualTo(3)
        assertThat(result.replayedCount).isEqualTo(2)
        assertThat(result.quarantinedCount).isEqualTo(1)
    }

    private fun receipt() =
        AdminOperationReceipt(
            operationId = UUID.randomUUID(),
            actorId = 7L,
            sessionRowId = 41L,
            fingerprint = "a".repeat(64),
            action = AdminOperationAction.TASK_DLQ_REPLAY,
            taskType = "",
            requestedLimit = 50,
            resetRetryCount = true,
            reason = "incident recovery",
        ).also {
            it.createdAt = Instant.parse("2026-08-24T00:00:00Z")
            it.modifiedAt = Instant.parse("2026-08-24T00:00:01Z")
        }

    private fun replay(
        selected: Int,
        replayed: Int,
        quarantined: Int,
    ) = TaskDlqReplayResult(
        taskType = null,
        requestedLimit = 50,
        selectedCount = selected,
        replayedCount = replayed,
        quarantinedCount = quarantined,
        resetRetryCount = true,
        replayedTaskIds = (1L..replayed.toLong()).toList(),
    )
}
