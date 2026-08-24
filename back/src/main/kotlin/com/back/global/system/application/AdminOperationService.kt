package com.back.global.system.application

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.system.adapter.persistence.AdminOperationReceiptRepository
import com.back.global.system.model.AdminOperationAction
import com.back.global.system.model.AdminOperationReceipt
import com.back.global.system.model.AdminOperationResultCode
import com.back.global.system.model.AdminOperationStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.UUID

@Service
class AdminOperationService(
    private val admissionService: AdminOperationAdmissionService,
    private val receiptRepository: AdminOperationReceiptRepository,
    private val executionService: AdminOperationExecutionService,
) {
    data class DlqReplayCommand(
        val operationId: UUID,
        val actorId: Long,
        val sessionRowId: Long?,
        val taskType: String?,
        val limit: Int,
        val resetRetryCount: Boolean,
        val reason: String,
    )

    data class OperationResult(
        val operationId: UUID,
        val actorId: Long,
        val sessionRowId: Long?,
        val action: AdminOperationAction,
        val target: String,
        val reason: String,
        val status: AdminOperationStatus,
        val resultCode: AdminOperationResultCode?,
        val selectedCount: Int,
        val replayedCount: Int,
        val quarantinedCount: Int,
        val createdAt: java.time.Instant,
        val modifiedAt: java.time.Instant,
    )

    fun submit(command: DlqReplayCommand): OperationResult {
        val normalized = normalize(command)
        val fingerprint = fingerprint(normalized)
        val receipt =
            admissionService.admit(
                AdminOperationReceipt(
                    operationId = normalized.operationId,
                    actorId = normalized.actorId,
                    sessionRowId = normalized.sessionRowId,
                    fingerprint = fingerprint,
                    action = AdminOperationAction.TASK_DLQ_REPLAY,
                    taskType = normalized.taskType.orEmpty(),
                    requestedLimit = normalized.limit,
                    resetRetryCount = normalized.resetRetryCount,
                    reason = normalized.reason,
                ),
            )
        ensureSameCommand(receipt, normalized.actorId, fingerprint)
        return if (receipt.status == AdminOperationStatus.ACCEPTED) executionService.execute(normalized.operationId) else receipt.toResult()
    }

    @Transactional(readOnly = true)
    fun get(
        operationId: UUID,
        actorId: Long,
    ): OperationResult =
        receiptRepository.findByOperationIdAndActorId(operationId, actorId)?.toResult()
            ?: throw AppException(ErrorCode.ADMIN_OPERATION_NOT_FOUND)

    private fun normalize(command: DlqReplayCommand): DlqReplayCommand {
        val taskType = command.taskType?.trim()?.takeIf { it.isNotEmpty() }
        val reason = command.reason.trim().replace(Regex("\\s+"), " ")
        if (reason.isEmpty() || reason.length > 200) throw AppException(ErrorCode.ADMIN_OPERATION_INVALID_COMMAND)
        if (taskType != null && taskType.length > 120) throw AppException(ErrorCode.ADMIN_OPERATION_INVALID_COMMAND)
        if (command.limit !in 1..200) throw AppException(ErrorCode.ADMIN_OPERATION_INVALID_COMMAND)
        return command.copy(taskType = taskType, reason = reason)
    }

    private fun fingerprint(command: DlqReplayCommand): String {
        val canonical =
            listOf(
                AdminOperationAction.TASK_DLQ_REPLAY.name,
                command.taskType.orEmpty(),
                command.limit.toString(),
                command.resetRetryCount.toString(),
                command.reason,
            ).joinToString(separator = "") { value -> "${value.length}:$value" }
        return MessageDigest
            .getInstance("SHA-256")
            .digest(canonical.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    private fun ensureSameCommand(
        receipt: AdminOperationReceipt,
        actorId: Long,
        fingerprint: String,
    ) {
        if (receipt.actorId != actorId || receipt.fingerprint != fingerprint) throw AppException(ErrorCode.ADMIN_OPERATION_CONFLICT)
    }

    private fun AdminOperationReceipt.toResult() =
        OperationResult(
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
