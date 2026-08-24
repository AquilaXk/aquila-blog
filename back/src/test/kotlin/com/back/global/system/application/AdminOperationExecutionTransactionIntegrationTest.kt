package com.back.global.system.application

import com.back.global.system.model.AdminOperationAction
import com.back.global.system.model.AdminOperationReceipt
import com.back.support.BaseAdminOperationExecutionTransactionIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

class AdminOperationExecutionTransactionIntegrationTest : BaseAdminOperationExecutionTransactionIntegrationTest() {
    @Autowired
    private lateinit var admissionService: AdminOperationAdmissionService

    @Autowired
    private lateinit var executionService: AdminOperationExecutionService

    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    private val operationIds = mutableListOf<UUID>()

    @AfterEach
    fun cleanup() {
        operationIds.forEach { operationId ->
            jdbcTemplate.update("DELETE FROM admin_operation_receipt WHERE operation_id = ?", operationId)
        }
    }

    @Test
    fun `unexpected execution failure rolls back receipt to accepted`() {
        val operationId = UUID.randomUUID().also(operationIds::add)
        admissionService.admit(receipt(operationId))
        `when`(taskDlqReplayService.replayFailedTasksWithLock(null, 50, true))
            .thenAnswer {
                jdbcTemplate.update(
                    """
                    UPDATE admin_operation_receipt
                    SET status = 'PARTIAL', selected_count = 9, replayed_count = 4, quarantined_count = 5
                    WHERE operation_id = ?
                    """.trimIndent(),
                    operationId,
                )
                throw IllegalStateException("execution unavailable")
            }

        assertThatThrownBy { executionService.execute(operationId) }
            .isInstanceOf(IllegalStateException::class.java)

        val stored =
            jdbcTemplate.queryForMap(
                """
                SELECT status, result_code, selected_count, replayed_count, quarantined_count
                FROM admin_operation_receipt
                WHERE operation_id = ?
                """.trimIndent(),
                operationId,
            )
        assertThat(stored["status"]).isEqualTo("ACCEPTED")
        assertThat(stored["result_code"]).isNull()
        assertThat(stored["selected_count"]).isEqualTo(0)
        assertThat(stored["replayed_count"]).isEqualTo(0)
        assertThat(stored["quarantined_count"]).isEqualTo(0)
    }

    private fun receipt(operationId: UUID) =
        AdminOperationReceipt(
            operationId = operationId,
            actorId = 7L,
            sessionRowId = 41L,
            fingerprint = "a".repeat(64),
            action = AdminOperationAction.TASK_DLQ_REPLAY,
            taskType = "",
            requestedLimit = 50,
            resetRetryCount = true,
            reason = "incident recovery",
        )
}
