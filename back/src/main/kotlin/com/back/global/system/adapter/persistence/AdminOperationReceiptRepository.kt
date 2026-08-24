package com.back.global.system.adapter.persistence

import com.back.global.system.application.port.output.AdminOperationReceiptPort
import com.back.global.system.model.AdminOperationReceipt
import jakarta.persistence.LockModeType
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.UUID

interface AdminOperationReceiptRepository :
    JpaRepository<AdminOperationReceipt, Long>,
    AdminOperationReceiptRepositoryCustom,
    AdminOperationReceiptPort {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select receipt from AdminOperationReceipt receipt where receipt.operationId = :operationId")
    override fun findByOperationIdWithLock(
        @Param("operationId") operationId: UUID,
    ): AdminOperationReceipt?

    override fun findByOperationIdAndActorId(
        operationId: UUID,
        actorId: Long,
    ): AdminOperationReceipt?

    override fun findByOperationId(operationId: UUID): AdminOperationReceipt?

    @Modifying
    @Query(
        value = """
        INSERT INTO admin_operation_receipt
            (operation_id, actor_id, session_row_id, fingerprint, action, task_type, requested_limit, reset_retry_count, reason,
             status, selected_count, replayed_count, quarantined_count, created_at, modified_at)
        VALUES
            (:operationId, :actorId, :sessionRowId, :fingerprint, :action, :taskType, :requestedLimit, :resetRetryCount, :reason,
             'ACCEPTED', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (operation_id) DO NOTHING
        """,
        nativeQuery = true,
    )
    override fun insertIfAbsent(
        @Param("operationId") operationId: UUID,
        @Param("actorId") actorId: Long,
        @Param("sessionRowId") sessionRowId: Long?,
        @Param("fingerprint") fingerprint: String,
        @Param("action") action: String,
        @Param("taskType") taskType: String,
        @Param("requestedLimit") requestedLimit: Int,
        @Param("resetRetryCount") resetRetryCount: Boolean,
        @Param("reason") reason: String,
    ): Int
}

interface AdminOperationReceiptRepositoryCustom {
    fun synchronizeTerminal(receipt: AdminOperationReceipt)
}
