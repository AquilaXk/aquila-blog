package com.back.global.system.application

import com.back.global.exception.application.ErrorCode
import com.back.global.system.application.port.output.AdminOperationReceiptPort
import com.back.global.system.model.AdminOperationAction
import com.back.global.system.model.AdminOperationReceipt
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.dao.DataAccessResourceFailureException
import java.util.UUID

class AdminOperationAdmissionServiceTest {
    private val receiptRepository = mock(AdminOperationReceiptPort::class.java)
    private val service = AdminOperationAdmissionService(receiptRepository)

    @Test
    fun `admission data access failure returns service unavailable`() {
        val receipt =
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
            )
        `when`(
            receiptRepository.insertIfAbsent(
                receipt.operationId,
                receipt.actorId,
                receipt.sessionRowId,
                receipt.fingerprint,
                receipt.action.name,
                receipt.taskType,
                receipt.requestedLimit,
                receipt.resetRetryCount,
                receipt.reason,
                null,
                null,
                null,
            ),
        ).thenThrow(DataAccessResourceFailureException("database unavailable"))

        assertThatThrownBy { service.admit(receipt) }
            .extracting("errorCode")
            .isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)
    }
}
