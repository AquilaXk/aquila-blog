package com.back.global.system.model

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.Instant
import java.util.UUID

enum class SearchRuntimeControlKey {
    PIPELINE_FORCE_CONTROL,
    MIRROR_FORCE_DISABLE,
}

enum class SearchRuntimeControlValue {
    UNSET,
    ENABLED,
    DISABLED,
}

@Entity
@Table(name = "search_runtime_control_state")
class SearchRuntimeControlState(
    @field:Id
    @field:Enumerated(EnumType.STRING)
    @field:Column(name = "control_key", nullable = false, length = 80)
    val controlKey: SearchRuntimeControlKey,
    @field:Enumerated(EnumType.STRING)
    @field:Column(name = "control_value", nullable = false, length = 16)
    var controlValue: SearchRuntimeControlValue,
    @field:Column(nullable = false)
    var version: Long = 0,
    @field:Column(name = "applied_operation_id")
    var appliedOperationId: UUID? = null,
    @field:CreationTimestamp
    @field:Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant? = null,
    @field:UpdateTimestamp
    @field:Column(name = "modified_at", nullable = false)
    var modifiedAt: Instant? = null,
) {
    fun apply(
        value: SearchRuntimeControlValue,
        operationId: UUID,
    ) {
        controlValue = value
        version += 1
        appliedOperationId = operationId
    }
}
