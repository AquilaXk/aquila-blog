package com.back.global.system.application

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.system.application.port.output.AdminOperationReceiptPort
import com.back.global.system.application.port.output.SearchRuntimeControlStatePort
import com.back.global.system.model.AdminOperationAction
import com.back.global.system.model.AdminOperationReceipt
import com.back.global.system.model.AdminOperationResultCode
import com.back.global.system.model.AdminOperationStatus
import com.back.global.system.model.SearchRuntimeControlKey
import com.back.global.system.model.SearchRuntimeControlState
import com.back.global.system.model.SearchRuntimeControlValue
import com.back.global.task.application.TaskDlqReplayResult
import com.back.global.task.application.TaskDlqReplayService
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.dao.DataAccessResourceFailureException
import java.time.Instant
import java.util.UUID

class AdminOperationExecutionServiceTest {
    private val receiptRepository = mock(AdminOperationReceiptPort::class.java)
    private val taskDlqReplayService = mock(TaskDlqReplayService::class.java)
    private val controlStateRepository = mock(SearchRuntimeControlStatePort::class.java)
    private val service = AdminOperationExecutionService(receiptRepository, taskDlqReplayService, controlStateRepository)

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

    @Test
    fun `missing receipt returns typed not found`() {
        val operationId = UUID.randomUUID()
        `when`(receiptRepository.findByOperationIdWithLock(operationId)).thenReturn(null)

        assertThatThrownBy { service.execute(operationId) }
            .isInstanceOf(AppException::class.java)
            .extracting("errorCode")
            .isEqualTo(ErrorCode.ADMIN_OPERATION_NOT_FOUND)
    }

    @Test
    fun `zero selected tasks succeeds with no matching code`() {
        val receipt = receipt()
        `when`(receiptRepository.findByOperationIdWithLock(receipt.operationId)).thenReturn(receipt)
        `when`(taskDlqReplayService.replayFailedTasksWithLock(null, 50, true)).thenReturn(replay(0, 0, 0))

        val result = service.execute(receipt.operationId)

        assertThat(result.status).isEqualTo(AdminOperationStatus.SUCCEEDED)
        assertThat(result.resultCode).isEqualTo(AdminOperationResultCode.NO_MATCHING_TASKS)
    }

    @Test
    fun `replayed tasks succeed and forward normalized task type`() {
        val receipt = receipt(taskType = "member.mail")
        `when`(receiptRepository.findByOperationIdWithLock(receipt.operationId)).thenReturn(receipt)
        `when`(taskDlqReplayService.replayFailedTasksWithLock("member.mail", 50, true)).thenReturn(replay(1, 1, 0))

        val result = service.execute(receipt.operationId)

        assertThat(result.status).isEqualTo(AdminOperationStatus.SUCCEEDED)
        assertThat(result.resultCode).isEqualTo(AdminOperationResultCode.TASKS_REPLAYED)
        assertThat(result.target).isEqualTo("member.mail")
        verify(taskDlqReplayService).replayFailedTasksWithLock("member.mail", 50, true)
    }

    @Test
    fun `pipeline control terminalizes one locked state version without DLQ replay`() {
        val receipt = searchReceipt()
        val state = SearchRuntimeControlState(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL, SearchRuntimeControlValue.UNSET)
        `when`(receiptRepository.findByOperationIdWithLock(receipt.operationId)).thenReturn(receipt)
        `when`(controlStateRepository.findByControlKeyWithLock(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL)).thenReturn(state)

        val result = service.execute(receipt.operationId)

        assertThat(state.version).isEqualTo(1)
        assertThat(state.appliedOperationId).isEqualTo(receipt.operationId)
        assertThat(result.resultCode).isEqualTo(AdminOperationResultCode.SEARCH_PIPELINE_FORCE_CONTROL_UPDATED)
        assertThat(result.controlVersion).isEqualTo(1)
        verify(taskDlqReplayService, org.mockito.Mockito.never())
            .replayFailedTasksWithLock(org.mockito.Mockito.any(), org.mockito.Mockito.anyInt(), org.mockito.Mockito.anyBoolean())
    }

    @Test
    fun `missing or unavailable search state returns service unavailable`() {
        val receipt = searchReceipt()
        `when`(receiptRepository.findByOperationIdWithLock(receipt.operationId)).thenReturn(receipt)
        `when`(controlStateRepository.findByControlKeyWithLock(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL)).thenReturn(null)

        assertThatThrownBy { service.execute(receipt.operationId) }
            .extracting("errorCode")
            .isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)

        `when`(controlStateRepository.findByControlKeyWithLock(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL))
            .thenThrow(DataAccessResourceFailureException("database unavailable"))
        assertThatThrownBy { service.execute(receipt.operationId) }
            .extracting("errorCode")
            .isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)
    }

    @Test
    fun `terminal search retry returns stored result without state or DLQ work`() {
        val receipt =
            searchReceipt().also {
                it.status = AdminOperationStatus.SUCCEEDED
                it.resultCode = AdminOperationResultCode.SEARCH_PIPELINE_FORCE_CONTROL_UPDATED
                it.controlVersion = 7
            }
        `when`(receiptRepository.findByOperationIdWithLock(receipt.operationId)).thenReturn(receipt)

        val result = service.execute(receipt.operationId)

        assertThat(result.resultCode).isEqualTo(AdminOperationResultCode.SEARCH_PIPELINE_FORCE_CONTROL_UPDATED)
        assertThat(result.controlVersion).isEqualTo(7)
        verify(controlStateRepository, org.mockito.Mockito.never())
            .findByControlKeyWithLock(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL)
        verify(taskDlqReplayService, org.mockito.Mockito.never())
            .replayFailedTasksWithLock(org.mockito.Mockito.any(), org.mockito.Mockito.anyInt(), org.mockito.Mockito.anyBoolean())
    }

    private fun receipt(taskType: String = "") =
        AdminOperationReceipt(
            operationId = UUID.randomUUID(),
            actorId = 7L,
            sessionRowId = 41L,
            fingerprint = "a".repeat(64),
            action = AdminOperationAction.TASK_DLQ_REPLAY,
            taskType = taskType,
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

    private fun searchReceipt() =
        AdminOperationReceipt(
            operationId = UUID.randomUUID(),
            actorId = 7L,
            sessionRowId = 41L,
            fingerprint = "a".repeat(64),
            action = AdminOperationAction.SEARCH_PIPELINE_FORCE_CONTROL,
            reason = "search control",
            controlKey = SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL,
            controlValue = SearchRuntimeControlValue.ENABLED,
        ).also {
            it.createdAt = Instant.parse("2026-08-24T00:00:00Z")
            it.modifiedAt = Instant.parse("2026-08-24T00:00:01Z")
        }
}
