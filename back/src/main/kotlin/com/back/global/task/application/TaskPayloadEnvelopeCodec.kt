package com.back.global.task.application

import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.standard.dto.ExpiringTaskPayload
import com.back.standard.dto.LegacyTaskPayload
import com.back.standard.dto.TaskPayload
import org.springframework.stereotype.Component
import tools.jackson.core.StreamReadFeature
import tools.jackson.databind.DeserializationFeature
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.node.ObjectNode
import java.time.Clock
import java.time.Instant
import java.util.UUID

data class TaskPayloadEnvelope(
    val schemaVersion: Int,
    val taskType: String,
    val sensitivity: TaskPayloadSensitivity,
    val createdAtEpochMs: Long,
    val expiresAtEpochMs: Long?,
    val payloadJson: String,
)

data class StoredTaskPayloadMetadata(
    val uid: UUID,
    val aggregateType: String,
    val aggregateId: Long,
    val taskType: String,
)

enum class TaskQuarantineReason {
    UNKNOWN_TASK_TYPE,
    MALFORMED_ENVELOPE,
    UNKNOWN_SCHEMA_VERSION,
    METADATA_MISMATCH,
    SENSITIVITY_MISMATCH,
    MALFORMED_PAYLOAD,
    EXPIRED_PAYLOAD,
}

class TaskPayloadQuarantineException(
    val reason: TaskQuarantineReason,
) : RuntimeException("Task payload quarantined: ${reason.name}")

@Component
class TaskPayloadEnvelopeCodec(
    private val objectMapper: ObjectMapper,
    private val clock: Clock,
) {
    private val strictEnvelopeReader =
        objectMapper
            .readerFor(TaskPayloadEnvelope::class.java)
            .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
    private val strictObjectReader =
        objectMapper
            .readerFor(ObjectNode::class.java)
            .with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)

    fun encode(
        payload: TaskPayload,
        entry: TaskHandlerEntry,
    ): String {
        if (!entry.payloadClass.isInstance(payload)) {
            throw IllegalArgumentException("Task payload class does not match registered handler entry")
        }
        val now = Instant.now(clock)
        val expiresAtEpochMs = expirationForEnqueue(payload, entry.sensitivity, now)
        val envelope =
            TaskPayloadEnvelope(
                schemaVersion = entry.schemaVersion,
                taskType = entry.taskType,
                sensitivity = entry.sensitivity,
                createdAtEpochMs = now.toEpochMilli(),
                expiresAtEpochMs = expiresAtEpochMs,
                payloadJson = objectMapper.writeValueAsString(payload),
            )
        return objectMapper.writeValueAsString(envelope)
    }

    fun decode(
        rawEnvelope: String,
        storedMetadata: StoredTaskPayloadMetadata,
        entry: TaskHandlerEntry,
    ): TaskPayload {
        val envelope = parseEnvelope(rawEnvelope)
        validateEnvelopeMetadata(envelope, storedMetadata, entry)
        val decoder =
            entry.decoderFor(envelope.schemaVersion)
                ?: throw quarantineException(TaskQuarantineReason.UNKNOWN_SCHEMA_VERSION)
        val payload = decodePayload(envelope.payloadJson, decoder)
        if (!entry.payloadClass.isInstance(payload)) {
            throw quarantineException(TaskQuarantineReason.MALFORMED_PAYLOAD)
        }
        validatePayloadMetadata(payload, storedMetadata)
        validateExpiration(envelope, payload, entry.sensitivity)
        return payload
    }

    private fun parseEnvelope(rawEnvelope: String): TaskPayloadEnvelope {
        val root = parseEnvelopeObject(rawEnvelope)
        val schemaVersionNode = root.get("schemaVersion")
        if (schemaVersionNode == null || !schemaVersionNode.isIntegralNumber) {
            throw quarantineException(TaskQuarantineReason.MALFORMED_ENVELOPE)
        }
        return if (schemaVersionNode.intValue() == LEGACY_FLAT_SCHEMA_VERSION) {
            parseFlatV1Envelope(root)
        } else {
            parseNestedEnvelope(rawEnvelope)
        }
    }

    private fun parseEnvelopeObject(rawEnvelope: String): ObjectNode =
        try {
            strictObjectReader.readValue(rawEnvelope)
        } catch (_: Exception) {
            throw quarantineException(TaskQuarantineReason.MALFORMED_ENVELOPE)
        }

    private fun parseFlatV1Envelope(root: ObjectNode): TaskPayloadEnvelope {
        if (root.has("payloadJson")) {
            throw quarantineException(TaskQuarantineReason.MALFORMED_ENVELOPE)
        }
        val payloadRoot = root.deepCopy()
        val metadata = linkedMapOf<String, Any?>()
        legacyFlatMetadataFields().forEach { field ->
            val value =
                payloadRoot.remove(field)
                    ?: throw quarantineException(TaskQuarantineReason.MALFORMED_ENVELOPE)
            metadata[field] = value
        }
        metadata["payloadJson"] = objectMapper.writeValueAsString(payloadRoot)
        return parseNestedEnvelope(objectMapper.writeValueAsString(metadata))
    }

    private fun parseNestedEnvelope(rawEnvelope: String): TaskPayloadEnvelope =
        try {
            strictEnvelopeReader.readValue(rawEnvelope)
        } catch (_: Exception) {
            throw quarantineException(TaskQuarantineReason.MALFORMED_ENVELOPE)
        }

    private fun validateEnvelopeMetadata(
        envelope: TaskPayloadEnvelope,
        storedMetadata: StoredTaskPayloadMetadata,
        entry: TaskHandlerEntry,
    ) {
        if (envelope.taskType != storedMetadata.taskType || envelope.taskType != entry.taskType) {
            throw quarantineException(TaskQuarantineReason.METADATA_MISMATCH)
        }
        if (envelope.sensitivity != entry.sensitivity) {
            throw quarantineException(TaskQuarantineReason.SENSITIVITY_MISMATCH)
        }
        val nowEpochMs = Instant.now(clock).toEpochMilli()
        if (
            envelope.createdAtEpochMs <= 0 ||
            envelope.createdAtEpochMs > nowEpochMs + MAX_ACCEPTED_CLOCK_SKEW_MS
        ) {
            throw quarantineException(TaskQuarantineReason.METADATA_MISMATCH)
        }
    }

    private fun decodePayload(
        payloadJson: String,
        decoder: TaskPayloadDecoder,
    ): TaskPayload =
        try {
            val decoded: TaskPayload =
                objectMapper
                    .readerFor(decoder.payloadClass)
                    .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                    .with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                    .readValue(payloadJson)
            if (decoded is LegacyTaskPayload) decoded.toCurrentTaskPayload() else decoded
        } catch (_: Exception) {
            throw quarantineException(TaskQuarantineReason.MALFORMED_PAYLOAD)
        }

    private fun validatePayloadMetadata(
        payload: TaskPayload,
        storedMetadata: StoredTaskPayloadMetadata,
    ) {
        if (
            payload.uid != storedMetadata.uid ||
            payload.aggregateType != storedMetadata.aggregateType ||
            payload.aggregateId != storedMetadata.aggregateId
        ) {
            throw quarantineException(TaskQuarantineReason.METADATA_MISMATCH)
        }
    }

    private fun validateExpiration(
        envelope: TaskPayloadEnvelope,
        payload: TaskPayload,
        sensitivity: TaskPayloadSensitivity,
    ) {
        val payloadExpiry = (payload as? ExpiringTaskPayload)?.expiresAt?.toEpochMilli()
        if (sensitivity != TaskPayloadSensitivity.EXPIRING_SECRET) {
            if (payloadExpiry != null || envelope.expiresAtEpochMs != null) {
                throw quarantineException(TaskQuarantineReason.SENSITIVITY_MISMATCH)
            }
            return
        }

        val exactPayloadExpiry =
            payloadExpiry
                ?: throw quarantineException(TaskQuarantineReason.SENSITIVITY_MISMATCH)
        if (envelope.schemaVersion == TaskHandlerRegistry.CURRENT_TASK_PAYLOAD_SCHEMA_VERSION) {
            if (envelope.expiresAtEpochMs != exactPayloadExpiry) {
                throw quarantineException(TaskQuarantineReason.METADATA_MISMATCH)
            }
        } else if (envelope.expiresAtEpochMs != null && envelope.expiresAtEpochMs != exactPayloadExpiry) {
            throw quarantineException(TaskQuarantineReason.METADATA_MISMATCH)
        }

        val effectiveExpiry = envelope.expiresAtEpochMs ?: exactPayloadExpiry
        if (effectiveExpiry <= Instant.now(clock).toEpochMilli()) {
            throw quarantineException(TaskQuarantineReason.EXPIRED_PAYLOAD)
        }
    }

    private fun expirationForEnqueue(
        payload: TaskPayload,
        sensitivity: TaskPayloadSensitivity,
        now: Instant,
    ): Long? {
        val expiringPayload = payload as? ExpiringTaskPayload
        if (sensitivity != TaskPayloadSensitivity.EXPIRING_SECRET) {
            require(expiringPayload == null) { "Only EXPIRING_SECRET task payloads may declare expiresAt" }
            return null
        }

        val expiresAt = requireNotNull(expiringPayload) { "EXPIRING_SECRET task payload must declare expiresAt" }.expiresAt
        require(expiresAt.isAfter(now)) { "Cannot enqueue an expired task payload" }
        return expiresAt.toEpochMilli()
    }

    private fun quarantineException(reason: TaskQuarantineReason): TaskPayloadQuarantineException = TaskPayloadQuarantineException(reason)

    private fun legacyFlatMetadataFields(): List<String> =
        listOf("schemaVersion", "taskType", "sensitivity", "createdAtEpochMs", "expiresAtEpochMs")

    private companion object {
        const val LEGACY_FLAT_SCHEMA_VERSION = 1
        const val MAX_ACCEPTED_CLOCK_SKEW_MS = 5_000L
    }
}
