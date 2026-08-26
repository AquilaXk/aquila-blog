package com.back.global.system.application

import com.back.global.system.model.AdminOperationAction
import com.back.global.system.model.AdminOperationReceipt
import com.back.global.system.model.AdminOperationResultCode
import com.back.global.system.model.AdminOperationStatus
import com.back.global.system.model.SearchRuntimeControlKey
import com.back.global.system.model.SearchRuntimeControlValue
import com.back.global.task.application.TaskDlqReplayResult
import com.back.support.BaseAdminOperationExecutionTransactionIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

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

    @Test
    fun `terminal response exposes persisted audit timestamp`() {
        val operationId = UUID.randomUUID().also(operationIds::add)
        admissionService.admit(receipt(operationId))
        `when`(taskDlqReplayService.replayFailedTasksWithLock(null, 50, true))
            .thenReturn(
                TaskDlqReplayResult(
                    taskType = null,
                    requestedLimit = 50,
                    selectedCount = 1,
                    replayedCount = 1,
                    quarantinedCount = 0,
                    resetRetryCount = true,
                    replayedTaskIds = listOf(1L),
                ),
            )

        val result = executionService.execute(operationId)
        val storedModifiedAt =
            jdbcTemplate
                .queryForObject(
                    "SELECT modified_at FROM admin_operation_receipt WHERE operation_id = ?",
                    java.sql.Timestamp::class.java,
                    operationId,
                )!!
                .toInstant()

        assertThat(result.status).isEqualTo(AdminOperationStatus.SUCCEEDED)
        assertThat(result.resultCode).isEqualTo(AdminOperationResultCode.TASKS_REPLAYED)
        assertThat(result.modifiedAt).isEqualTo(storedModifiedAt)
    }

    @Test
    fun `missing pipeline state keeps admitted receipt accepted`() {
        val snapshot = pipelineState()
        val operationId = UUID.randomUUID().also(operationIds::add)
        try {
            admissionService.admit(searchReceipt(operationId, SearchRuntimeControlValue.ENABLED))
            jdbcTemplate.update("DELETE FROM search_runtime_control_state WHERE control_key = ?", SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL.name)

            assertThatThrownBy { executionService.execute(operationId) }
                .extracting("errorCode")
                .isEqualTo(com.back.global.exception.application.ErrorCode.SERVICE_UNAVAILABLE)
            assertThat(
                jdbcTemplate.queryForObject(
                    "SELECT status FROM admin_operation_receipt WHERE operation_id = ?",
                    String::class.java,
                    operationId,
                ),
            ).isEqualTo("ACCEPTED")
        } finally {
            restorePipelineState(snapshot)
        }
    }

    @Test
    fun `concurrent pipeline operations serialize state versions`() {
        val snapshot = pipelineState()
        val firstId = UUID.randomUUID().also(operationIds::add)
        val secondId = UUID.randomUUID().also(operationIds::add)
        try {
            admissionService.admit(searchReceipt(firstId, SearchRuntimeControlValue.ENABLED))
            admissionService.admit(searchReceipt(secondId, SearchRuntimeControlValue.DISABLED))
            val ready = CountDownLatch(2)
            val start = CountDownLatch(1)
            Executors.newFixedThreadPool(2).use { executor ->
                val results =
                    listOf(firstId, secondId).map { operationId ->
                        executor.submit<AdminOperationService.OperationResult> {
                            ready.countDown()
                            check(start.await(10, TimeUnit.SECONDS)) { "search operation start timed out" }
                            executionService.execute(operationId)
                        }
                    }
                assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue()
                start.countDown()
                val completed = results.map { it.get(20, TimeUnit.SECONDS) }
                assertThat(completed.map { it.controlVersion }).containsExactlyInAnyOrder(snapshot.version + 1, snapshot.version + 2)
                val final = pipelineState()
                val versionTwo = completed.single { it.controlVersion == snapshot.version + 2 }
                assertThat(final.version).isEqualTo(snapshot.version + 2)
                assertThat(final.appliedOperationId).isEqualTo(versionTwo.operationId)
            }
        } finally {
            restorePipelineState(snapshot)
        }
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

    private fun searchReceipt(
        operationId: UUID,
        value: SearchRuntimeControlValue,
    ) =
        AdminOperationReceipt(
            operationId = operationId,
            actorId = 7L,
            sessionRowId = 41L,
            fingerprint = operationId.toString().replace("-", "").padEnd(64, 'a'),
            action = AdminOperationAction.SEARCH_PIPELINE_FORCE_CONTROL,
            reason = "search control",
            controlKey = SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL,
            controlValue = value,
        )

    private fun pipelineState(): PipelineState =
        jdbcTemplate.queryForObject(
            "SELECT control_value, version, applied_operation_id, created_at, modified_at FROM search_runtime_control_state WHERE control_key = ?",
            { result, _ ->
                PipelineState(
                    result.getString("control_value"),
                    result.getLong("version"),
                    result.getObject("applied_operation_id", UUID::class.java),
                    result.getTimestamp("created_at").toInstant(),
                    result.getTimestamp("modified_at").toInstant(),
                )
            },
            SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL.name,
        )!!

    private fun restorePipelineState(snapshot: PipelineState) {
        jdbcTemplate.update(
            """
            INSERT INTO search_runtime_control_state (control_key, control_value, version, applied_operation_id, created_at, modified_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (control_key) DO UPDATE SET
                control_value = EXCLUDED.control_value,
                version = EXCLUDED.version,
                applied_operation_id = EXCLUDED.applied_operation_id,
                created_at = EXCLUDED.created_at,
                modified_at = EXCLUDED.modified_at
            """.trimIndent(),
            SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL.name,
            snapshot.value,
            snapshot.version,
            snapshot.appliedOperationId,
            java.sql.Timestamp.from(snapshot.createdAt),
            java.sql.Timestamp.from(snapshot.modifiedAt),
        )
    }

    private data class PipelineState(
        val value: String,
        val version: Long,
        val appliedOperationId: UUID?,
        val createdAt: java.time.Instant,
        val modifiedAt: java.time.Instant,
    )
}
