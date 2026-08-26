package com.back.global.system.application

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.system.application.port.output.AdminOperationReceiptPort
import com.back.global.system.application.port.output.SearchRuntimeControlStatePort
import com.back.global.system.model.AdminOperationAction
import com.back.global.system.model.AdminOperationReceipt
import com.back.global.system.model.AdminOperationResultCode
import com.back.global.system.model.AdminOperationStatus
import com.back.global.task.application.TaskDlqReplayResult
import com.back.global.task.application.TaskDlqReplayService
import org.springframework.dao.DataAccessException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class AdminOperationExecutionService(
    private val receiptRepository: AdminOperationReceiptPort,
    private val taskDlqReplayService: TaskDlqReplayService,
    private val controlStateRepository: SearchRuntimeControlStatePort,
) {
    @Transactional
    fun execute(operationId: UUID): AdminOperationService.OperationResult {
        val receipt =
            try {
                receiptRepository.findByOperationIdWithLock(operationId)
                    ?: throw AppException(ErrorCode.ADMIN_OPERATION_NOT_FOUND)
            } catch (error: DataAccessException) {
                throw AppException(ErrorCode.SERVICE_UNAVAILABLE, cause = error)
            }
        if (receipt.status == AdminOperationStatus.ACCEPTED) {
            try {
                when (receipt.action) {
                    AdminOperationAction.TASK_DLQ_REPLAY -> executeDlqReplay(receipt)
                    AdminOperationAction.SEARCH_PIPELINE_FORCE_CONTROL ->
                        executeSearchControl(receipt, AdminOperationResultCode.SEARCH_PIPELINE_FORCE_CONTROL_UPDATED)
                    AdminOperationAction.SEARCH_ENGINE_MIRROR_FORCE_DISABLE ->
                        executeSearchControl(receipt, AdminOperationResultCode.SEARCH_ENGINE_MIRROR_FORCE_DISABLE_UPDATED)
                }
                receiptRepository.synchronizeTerminal(receipt)
            } catch (error: DataAccessException) {
                throw AppException(ErrorCode.SERVICE_UNAVAILABLE, cause = error)
            }
        }
        return receipt.toResult()
    }

    private fun executeDlqReplay(receipt: AdminOperationReceipt) {
        val replay =
            taskDlqReplayService.replayFailedTasksWithLock(
                taskType = receipt.taskType?.ifBlank { null },
                limit = requireNotNull(receipt.requestedLimit),
                resetRetryCount = requireNotNull(receipt.resetRetryCount),
            )
        applyTerminal(receipt, replay)
    }

    private fun executeSearchControl(
        receipt: AdminOperationReceipt,
        resultCode: AdminOperationResultCode,
    ) {
        val key = requireNotNull(receipt.controlKey)
        val value = requireNotNull(receipt.controlValue)
        val state =
            controlStateRepository.findByControlKeyWithLock(key)
                ?: throw AppException(ErrorCode.SERVICE_UNAVAILABLE)
        state.apply(value, receipt.operationId)
        receipt.status = AdminOperationStatus.SUCCEEDED
        receipt.resultCode = resultCode
        receipt.controlVersion = state.version
    }

    private fun applyTerminal(
        receipt: AdminOperationReceipt,
        replay: TaskDlqReplayResult,
    ) {
        receipt.selectedCount = replay.selectedCount
        receipt.replayedCount = replay.replayedCount
        receipt.quarantinedCount = replay.quarantinedCount
        when {
            replay.selectedCount == 0 -> {
                receipt.status = AdminOperationStatus.SUCCEEDED
                receipt.resultCode = AdminOperationResultCode.NO_MATCHING_TASKS
            }
            replay.replayedCount == 0 -> {
                receipt.status = AdminOperationStatus.FAILED
                receipt.resultCode = AdminOperationResultCode.ALL_TASKS_QUARANTINED
            }
            replay.quarantinedCount == 0 -> {
                receipt.status = AdminOperationStatus.SUCCEEDED
                receipt.resultCode = AdminOperationResultCode.TASKS_REPLAYED
            }
            else -> {
                receipt.status = AdminOperationStatus.PARTIAL
                receipt.resultCode = AdminOperationResultCode.TASKS_PARTIALLY_REPLAYED
            }
        }
    }

    private fun AdminOperationReceipt.toResult() =
        AdminOperationService.OperationResult(
            operationId = operationId,
            actorId = actorId,
            sessionRowId = sessionRowId,
            action = action,
            target = controlKey?.name ?: taskType?.ifBlank { "ALL_FAILED_TASKS" } ?: "ALL_FAILED_TASKS",
            reason = reason,
            status = status,
            resultCode = resultCode,
            selectedCount = selectedCount,
            replayedCount = replayedCount,
            quarantinedCount = quarantinedCount,
            createdAt = createdAt,
            modifiedAt = modifiedAt,
            controlKey = controlKey,
            controlValue = controlValue,
            controlVersion = controlVersion,
        )
}
