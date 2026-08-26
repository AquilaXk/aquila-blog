package com.back.global.system.application

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.system.application.port.output.AdminOperationReceiptPort
import com.back.global.system.model.AdminOperationReceipt
import org.springframework.dao.DataAccessException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class AdminOperationAdmissionService(
    private val receiptRepository: AdminOperationReceiptPort,
) {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun admit(receipt: AdminOperationReceipt): AdminOperationReceipt {
        try {
            receiptRepository.insertIfAbsent(
                operationId = receipt.operationId,
                actorId = receipt.actorId,
                sessionRowId = receipt.sessionRowId,
                fingerprint = receipt.fingerprint,
                action = receipt.action.name,
                taskType = receipt.taskType,
                requestedLimit = receipt.requestedLimit,
                resetRetryCount = receipt.resetRetryCount,
                reason = receipt.reason,
                controlKey = receipt.controlKey?.name,
                controlValue = receipt.controlValue?.name,
                controlVersion = receipt.controlVersion,
            )
            return receiptRepository.findByOperationId(receipt.operationId) ?: error("Admin operation admission was not persisted")
        } catch (error: DataAccessException) {
            throw AppException(ErrorCode.SERVICE_UNAVAILABLE, cause = error)
        }
    }
}
