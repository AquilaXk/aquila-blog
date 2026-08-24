package com.back.global.system.application

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.system.application.port.output.AdminOperationReceiptPort
import com.back.global.system.model.AdminOperationReceipt
import com.back.global.system.model.AdminOperationResultCode
import com.back.global.system.model.AdminOperationStatus
import com.back.global.task.application.TaskDlqReplayResult
import com.back.global.task.application.TaskDlqReplayService
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class AdminOperationExecutionService(
    private val receiptRepository: AdminOperationReceiptPort,
    private val taskDlqReplayService: TaskDlqReplayService,
) {
    @Transactional
    fun execute(operationId: UUID): AdminOperationService.OperationResult {
        val receipt =
            receiptRepository.findByOperationIdWithLock(operationId)
                ?: throw AppException(ErrorCode.ADMIN_OPERATION_NOT_FOUND)
        if (receipt.status == AdminOperationStatus.ACCEPTED) {
            val replay =
                taskDlqReplayService.replayFailedTasksWithLock(
                    taskType = receipt.taskType.ifBlank { null },
                    limit = receipt.requestedLimit,
                    resetRetryCount = receipt.resetRetryCount,
                )
            applyTerminal(receipt, replay)
            receiptRepository.flush()
        }
        return receipt.toResult()
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
            target = taskType.ifBlank { "ALL_FAILED_TASKS" },
            reason = reason,
            status = status,
            resultCode = resultCode,
            selectedCount = selectedCount,
            replayedCount = replayedCount,
            quarantinedCount = quarantinedCount,
            createdAt = createdAt,
            modifiedAt = modifiedAt,
        )
}
