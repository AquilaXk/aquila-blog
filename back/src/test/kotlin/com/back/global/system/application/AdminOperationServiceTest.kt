package com.back.global.system.application

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.system.application.port.output.AdminOperationReceiptPort
import com.back.global.system.model.AdminOperationAction
import com.back.global.system.model.AdminOperationReceipt
import com.back.global.system.model.AdminOperationResultCode
import com.back.global.system.model.AdminOperationStatus
import com.back.global.system.model.SearchRuntimeControlKey
import com.back.global.system.model.SearchRuntimeControlValue
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import java.time.Instant
import java.util.UUID

class AdminOperationServiceTest {
    private val admission = mock(AdminOperationAdmissionService::class.java)
    private val receiptRepository = mock(AdminOperationReceiptPort::class.java)
    private val execution = mock(AdminOperationExecutionService::class.java)
    private val service = AdminOperationService(admission, receiptRepository, execution)

    @Test
    fun `same operation and normalized command reuses terminal receipt without execution`() {
        val command = command(reason = "  incident   recovery ")
        val receipt = receipt(command, status = AdminOperationStatus.SUCCEEDED, resultCode = AdminOperationResultCode.TASKS_REPLAYED)
        `when`(admission.admit(anyReceipt())).thenReturn(receipt)

        val result = service.submit(command)

        assertThat(result.status).isEqualTo(AdminOperationStatus.SUCCEEDED)
        assertThat(result.reason).isEqualTo("incident recovery")
        verify(execution, never()).execute(command.operationId)
    }

    @Test
    fun `different actor for existing operation conflicts before execution`() {
        val command = command(actorId = 8L)
        `when`(admission.admit(anyReceipt()))
            .thenReturn(receipt(command.copy(actorId = 7L)))

        assertThatThrownBy { service.submit(command) }.isInstanceOf(AppException::class.java)
        verify(execution, never()).execute(command.operationId)
    }

    @Test
    fun `same operation with different normalized command conflicts before execution`() {
        val command = command()
        `when`(admission.admit(anyReceipt()))
            .thenReturn(receipt(command))

        assertThatThrownBy { service.submit(command.copy(reason = "different incident")) }
            .isInstanceOf(AppException::class.java)

        verify(execution, never()).execute(command.operationId)
    }

    @Test
    fun `accepted operation executes exactly once`() {
        val command = command()
        `when`(admission.admit(anyReceipt()))
            .thenReturn(receipt(command, status = AdminOperationStatus.ACCEPTED))
        `when`(execution.execute(command.operationId)).thenReturn(result(command))

        assertThat(service.submit(command).status).isEqualTo(AdminOperationStatus.SUCCEEDED)

        verify(execution).execute(command.operationId)
    }

    @Test
    fun `admission failure executes no task replay`() {
        val command = command()
        `when`(admission.admit(anyReceipt()))
            .thenThrow(IllegalStateException("admission unavailable"))

        assertThatThrownBy { service.submit(command) }.isInstanceOf(IllegalStateException::class.java)

        verify(execution, never()).execute(command.operationId)
    }

    @Test
    fun `execution exception propagates without false terminal result`() {
        val command = command()
        `when`(admission.admit(anyReceipt()))
            .thenReturn(receipt(command, status = AdminOperationStatus.ACCEPTED))
        `when`(execution.execute(command.operationId)).thenThrow(IllegalStateException("execution unavailable"))

        assertThatThrownBy { service.submit(command) }.isInstanceOf(IllegalStateException::class.java)

        verify(execution).execute(command.operationId)
    }

    @Test
    fun `get scopes receipt to current actor and hides other actor`() {
        val command = command()
        `when`(receiptRepository.findByOperationIdAndActorId(command.operationId, command.actorId)).thenReturn(receipt(command))
        assertThat(service.get(command.operationId, command.actorId).actorId).isEqualTo(command.actorId)
        `when`(receiptRepository.findByOperationIdAndActorId(command.operationId, 99L)).thenReturn(null)
        assertThatThrownBy { service.get(command.operationId, 99L) }.isInstanceOf(AppException::class.java)
    }

    @Test
    fun `same UUID and normalized pipeline command returns terminal receipt without execution`() {
        val command = pipelineCommand(reason = "  search   control ")
        `when`(receiptRepository.findByOperationId(command.operationId))
            .thenReturn(pipelineReceipt(command))

        val first = service.submitPipelineForceControl(command)
        val second = service.submitPipelineForceControl(command.copy(reason = "search control"))

        assertThat(second.operationId).isEqualTo(first.operationId)
        assertThat(second.controlVersion).isEqualTo(1)
        verify(execution, never()).execute(command.operationId)
    }

    @Test
    fun `same UUID and different pipeline value conflicts before execution`() {
        val command = pipelineCommand(forceControl = true)
        `when`(receiptRepository.findByOperationId(command.operationId))
            .thenReturn(pipelineReceipt(command))
        service.submitPipelineForceControl(command)

        assertThatThrownBy { service.submitPipelineForceControl(command.copy(forceControl = false)) }
            .isInstanceOf(AppException::class.java)
        verify(execution, never()).execute(command.operationId)
    }

    @Test
    fun `same UUID and different search action conflicts before execution`() {
        val command = pipelineCommand(forceControl = true)
        `when`(receiptRepository.findByOperationId(command.operationId))
            .thenReturn(pipelineReceipt(command))
        service.submitPipelineForceControl(command)

        assertThatThrownBy {
            service.submitSearchEngineMirrorForceDisable(
                AdminOperationService.SearchEngineMirrorForceDisableCommand(
                    operationId = command.operationId,
                    actorId = command.actorId,
                    sessionRowId = command.sessionRowId,
                    forceDisabled = true,
                    reason = command.reason,
                ),
            )
        }.isInstanceOf(AppException::class.java)
        verify(execution, never()).execute(command.operationId)
    }

    @Test
    fun `new search operation IDs fail unavailable without admission or execution`() {
        val pipeline = pipelineCommand()
        val mirror =
            AdminOperationService.SearchEngineMirrorForceDisableCommand(
                operationId = UUID.fromString("a4c48810-a3b6-47a6-8ca2-4f7c14b0d0fd"),
                actorId = 7L,
                sessionRowId = 41L,
                forceDisabled = true,
                reason = "search control",
            )
        `when`(receiptRepository.findByOperationId(pipeline.operationId)).thenReturn(null)
        `when`(receiptRepository.findByOperationId(mirror.operationId)).thenReturn(null)

        assertThatThrownBy { service.submitPipelineForceControl(pipeline) }
            .extracting("errorCode")
            .isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)
        assertThatThrownBy { service.submitSearchEngineMirrorForceDisable(mirror) }
            .extracting("errorCode")
            .isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)

        verifyNoInteractions(admission, execution)
    }

    @Test
    fun `existing accepted search receipt resumes execution`() {
        val command = pipelineCommand(forceControl = true)
        val receipt = pipelineReceipt(command, status = AdminOperationStatus.ACCEPTED)
        `when`(receiptRepository.findByOperationId(command.operationId)).thenReturn(receipt)
        `when`(execution.execute(command.operationId)).thenReturn(searchResult(receipt))

        assertThat(service.submitPipelineForceControl(command).controlVersion).isEqualTo(1)

        verify(execution).execute(command.operationId)
        verifyNoInteractions(admission)
    }

    private fun command(
        actorId: Long = 7L,
        reason: String = "incident recovery",
    ) = AdminOperationService.DlqReplayCommand(
        operationId = UUID.fromString("f4791e0e-3857-4ef1-9fe7-2a9654a2208f"),
        actorId = actorId,
        sessionRowId = 41L,
        taskType = null,
        limit = 50,
        resetRetryCount = true,
        reason = reason,
    )

    private fun anyReceipt(): AdminOperationReceipt = ArgumentMatchers.any(AdminOperationReceipt::class.java) ?: receipt(command())

    private fun receipt(
        command: AdminOperationService.DlqReplayCommand,
        status: AdminOperationStatus = AdminOperationStatus.SUCCEEDED,
        resultCode: AdminOperationResultCode? = AdminOperationResultCode.NO_MATCHING_TASKS,
    ): AdminOperationReceipt =
        AdminOperationReceipt(
            operationId = command.operationId,
            actorId = command.actorId,
            sessionRowId = command.sessionRowId,
            fingerprint = fingerprint(command),
            action = AdminOperationAction.TASK_DLQ_REPLAY,
            taskType = "",
            requestedLimit = 50,
            resetRetryCount = true,
            reason = command.reason.trim().replace(Regex("\\s+"), " "),
            status = status,
            resultCode = resultCode,
        ).also {
            it.createdAt = Instant.parse("2026-08-24T00:00:00Z")
            it.modifiedAt = Instant.parse("2026-08-24T00:00:01Z")
        }

    private fun result(command: AdminOperationService.DlqReplayCommand) =
        AdminOperationService.OperationResult(
            operationId = command.operationId,
            actorId = command.actorId,
            sessionRowId = command.sessionRowId,
            action = AdminOperationAction.TASK_DLQ_REPLAY,
            target = "ALL_FAILED_TASKS",
            reason = command.reason,
            status = AdminOperationStatus.SUCCEEDED,
            resultCode = AdminOperationResultCode.TASKS_REPLAYED,
            selectedCount = 1,
            replayedCount = 1,
            quarantinedCount = 0,
            createdAt = Instant.parse("2026-08-24T00:00:00Z"),
            modifiedAt = Instant.parse("2026-08-24T00:00:01Z"),
        )

    private fun pipelineCommand(
        forceControl: Boolean? = null,
        reason: String = "search control",
    ): AdminOperationService.SearchPipelineForceControlCommand =
        AdminOperationService.SearchPipelineForceControlCommand(
            operationId = UUID.fromString("f4791e0e-3857-4ef1-9fe7-2a9654a2208f"),
            actorId = 7L,
            sessionRowId = 41L,
            forceControl = forceControl,
            reason = reason,
        )

    private fun pipelineReceipt(
        command: AdminOperationService.SearchPipelineForceControlCommand,
        status: AdminOperationStatus = AdminOperationStatus.SUCCEEDED,
    ): AdminOperationReceipt {
        val controlValue =
            when (command.forceControl) {
                null -> SearchRuntimeControlValue.UNSET
                true -> SearchRuntimeControlValue.ENABLED
                false -> SearchRuntimeControlValue.DISABLED
            }
        val reason = command.reason.trim().replace(Regex("\\s+"), " ")
        return AdminOperationReceipt(
            operationId = command.operationId,
            actorId = command.actorId,
            sessionRowId = command.sessionRowId,
            fingerprint = searchFingerprint(controlValue, reason),
            action = AdminOperationAction.SEARCH_PIPELINE_FORCE_CONTROL,
            reason = reason,
            status = status,
            resultCode =
                if (status == AdminOperationStatus.ACCEPTED) {
                    null
                } else {
                    AdminOperationResultCode.SEARCH_PIPELINE_FORCE_CONTROL_UPDATED
                },
            controlKey = SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL,
            controlValue = controlValue,
            controlVersion = if (status == AdminOperationStatus.ACCEPTED) null else 1,
        ).also {
            it.createdAt = Instant.parse("2026-08-24T00:00:00Z")
            it.modifiedAt = Instant.parse("2026-08-24T00:00:01Z")
        }
    }

    private fun searchResult(receipt: AdminOperationReceipt) =
        AdminOperationService.OperationResult(
            operationId = receipt.operationId,
            actorId = receipt.actorId,
            sessionRowId = receipt.sessionRowId,
            action = receipt.action,
            target = requireNotNull(receipt.controlKey).name,
            reason = receipt.reason,
            status = AdminOperationStatus.SUCCEEDED,
            resultCode = AdminOperationResultCode.SEARCH_PIPELINE_FORCE_CONTROL_UPDATED,
            selectedCount = 0,
            replayedCount = 0,
            quarantinedCount = 0,
            createdAt = requireNotNull(receipt.createdAt),
            modifiedAt = requireNotNull(receipt.modifiedAt),
            controlKey = receipt.controlKey,
            controlValue = receipt.controlValue,
            controlVersion = 1,
        )

    private fun searchFingerprint(
        value: SearchRuntimeControlValue,
        reason: String,
    ): String {
        val method =
            AdminOperationService::class.java.getDeclaredMethod(
                "searchFingerprint",
                AdminOperationAction::class.java,
                SearchRuntimeControlKey::class.java,
                SearchRuntimeControlValue::class.java,
                String::class.java,
            )
        method.isAccessible = true
        return method.invoke(
            service,
            AdminOperationAction.SEARCH_PIPELINE_FORCE_CONTROL,
            SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL,
            value,
            reason,
        ) as String
    }

    private fun fingerprint(command: AdminOperationService.DlqReplayCommand): String {
        val method = AdminOperationService::class.java.getDeclaredMethod("fingerprint", AdminOperationService.DlqReplayCommand::class.java)
        method.isAccessible = true
        return method.invoke(service, command.copy(reason = command.reason.trim().replace(Regex("\\s+"), " "))) as String
    }
}
