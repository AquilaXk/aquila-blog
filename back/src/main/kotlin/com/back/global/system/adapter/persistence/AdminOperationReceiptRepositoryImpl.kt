package com.back.global.system.adapter.persistence

import com.back.global.system.model.AdminOperationReceipt
import jakarta.persistence.EntityManager

class AdminOperationReceiptRepositoryImpl(
    private val entityManager: EntityManager,
) : AdminOperationReceiptRepositoryCustom {
    override fun synchronizeTerminal(receipt: AdminOperationReceipt) {
        entityManager.flush()
        entityManager.refresh(receipt)
    }
}
