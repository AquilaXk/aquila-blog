package com.back.global.system.application.port.output

import com.back.global.system.model.AdminOperationReceipt
import java.util.UUID

interface AdminOperationReceiptPort {
    fun synchronizeTerminal(receipt: AdminOperationReceipt)

    fun findByOperationIdWithLock(operationId: UUID): AdminOperationReceipt?

    fun findByOperationIdAndActorId(
        operationId: UUID,
        actorId: Long,
    ): AdminOperationReceipt?

    fun findByOperationId(operationId: UUID): AdminOperationReceipt?

    fun insertIfAbsent(
        operationId: UUID,
        actorId: Long,
        sessionRowId: Long?,
        fingerprint: String,
        action: String,
        taskType: String?,
        requestedLimit: Int?,
        resetRetryCount: Boolean?,
        reason: String,
        controlKey: String?,
        controlValue: String?,
        controlVersion: Long?,
    ): Int
}
