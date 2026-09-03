package com.back.global.task.application

import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.standard.dto.ExpiringTaskPayload
import com.back.standard.dto.TaskPayload
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class TaskPayloadEnvelopeCodecTest {
    private val now = Instant.parse("2026-08-11T00:00:00Z")
    private val objectMapper = jacksonObjectMapper()
    private val codec = TaskPayloadEnvelopeCodec(objectMapper, Clock.fixed(now, ZoneOffset.UTC))

    @Test
    fun `v2 envelope round trip uses the registered current payload class`() {
        val payload = StubTaskPayload(UUID.randomUUID(), "Post", 41L, "value")
        val entry = entry(StubTaskPayload::class.java, TaskPayloadSensitivity.INTERNAL)

        val encoded = codec.encode(payload, entry)
        val decoded = codec.decode(encoded, metadata(payload, entry.taskType), entry)

        assertThat(decoded).isEqualTo(payload)
    }

    @Test
    fun `encode는 registered payload class mismatch를 거부한다`() {
        val entry = entry(StubTaskPayload::class.java, TaskPayloadSensitivity.INTERNAL)
        val payload = OtherTaskPayload(UUID.randomUUID(), "Post", 40L)

        assertThatThrownBy { codec.encode(payload, entry) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Task payload class does not match registered handler entry")
    }

    @Test
    fun `flat and nested v1 envelopes fail closed`() {
        val payload = StubTaskPayload(UUID.randomUUID(), "Post", 42L, "legacy")
        val entry = entry(StubTaskPayload::class.java, TaskPayloadSensitivity.INTERNAL)
        val encoded = flatV1EnvelopeJson(payload, entry)

        assertQuarantined(TaskQuarantineReason.MALFORMED_ENVELOPE) {
            codec.decode(encoded, metadata(payload, entry.taskType), entry)
        }
        assertQuarantined(TaskQuarantineReason.UNKNOWN_SCHEMA_VERSION) {
            codec.decode(envelopeJson(payload, entry, schemaVersion = 1), metadata(payload, entry.taskType), entry)
        }
    }

    @Test
    fun `duplicate or unknown envelope fields fail closed as malformed`() {
        val payload = StubTaskPayload(UUID.randomUUID(), "Post", 43L, "strict")
        val entry = entry(StubTaskPayload::class.java, TaskPayloadSensitivity.INTERNAL)
        val encoded = codec.encode(payload, entry)
        val duplicate = encoded.replaceFirst("\"schemaVersion\":2", "\"schemaVersion\":2,\"schemaVersion\":2")
        val unknown = encoded.replaceFirst("{", "{\"legacyPayload\":true,")

        assertQuarantined(TaskQuarantineReason.MALFORMED_ENVELOPE) {
            codec.decode(duplicate, metadata(payload, entry.taskType), entry)
        }
        assertQuarantined(TaskQuarantineReason.MALFORMED_ENVELOPE) {
            codec.decode(unknown, metadata(payload, entry.taskType), entry)
        }

        assertQuarantined(TaskQuarantineReason.MALFORMED_ENVELOPE) {
            codec.decode("{}", metadata(payload, entry.taskType), entry)
        }
    }

    @Test
    fun `unknown schema version does not try another decoder`() {
        val payload = StubTaskPayload(UUID.randomUUID(), "Post", 44L, "unknown")
        val entry = entry(StubTaskPayload::class.java, TaskPayloadSensitivity.INTERNAL)
        val encoded = envelopeJson(payload, entry, schemaVersion = 99)

        assertQuarantined(TaskQuarantineReason.UNKNOWN_SCHEMA_VERSION) {
            codec.decode(encoded, metadata(payload, entry.taskType), entry)
        }
    }

    @Test
    fun `task identity and sensitivity mismatch fail closed`() {
        val payload = StubTaskPayload(UUID.randomUUID(), "Post", 45L, "identity")
        val entry = entry(StubTaskPayload::class.java, TaskPayloadSensitivity.INTERNAL)
        val encoded = codec.encode(payload, entry)

        assertQuarantined(TaskQuarantineReason.METADATA_MISMATCH) {
            codec.decode(encoded, metadata(payload.copy(aggregateId = 46L), entry.taskType), entry)
        }
        val personalEntry = entry(StubTaskPayload::class.java, TaskPayloadSensitivity.PERSONAL)
        assertQuarantined(TaskQuarantineReason.SENSITIVITY_MISMATCH) {
            codec.decode(encoded, metadata(payload, personalEntry.taskType), personalEntry)
        }

        val wrongTaskType = envelopeJson(payload, entry, schemaVersion = 2, taskType = "test.other")
        assertQuarantined(TaskQuarantineReason.METADATA_MISMATCH) {
            codec.decode(wrongTaskType, metadata(payload, entry.taskType), entry)
        }

        val toleratedClockSkewEnvelope =
            envelopeJson(payload, entry, schemaVersion = 2, createdAtEpochMs = now.plusSeconds(5).toEpochMilli())
        assertThat(codec.decode(toleratedClockSkewEnvelope, metadata(payload, entry.taskType), entry))
            .isEqualTo(payload)

        val futureEnvelope = envelopeJson(payload, entry, schemaVersion = 2, createdAtEpochMs = now.plusSeconds(6).toEpochMilli())
        assertQuarantined(TaskQuarantineReason.METADATA_MISMATCH) {
            codec.decode(futureEnvelope, metadata(payload, entry.taskType), entry)
        }
    }

    @Test
    fun `current payload class mismatch는 malformed payload로 quarantine한다`() {
        val payload = OtherTaskPayload(UUID.randomUUID(), "Post", 46L)
        val entry =
            directEntry(StubTaskPayload::class.java, TaskPayloadSensitivity.INTERNAL)
        val encoded = envelopeJson(payload, entry, schemaVersion = 2)

        assertQuarantined(TaskQuarantineReason.MALFORMED_PAYLOAD) {
            codec.decode(encoded, metadata(payload, entry.taskType), entry)
        }
    }

    @Test
    fun `malformed payload and expired secret are quarantined without fallback`() {
        val payload = StubTaskPayload(UUID.randomUUID(), "Post", 47L, "malformed")
        val entry = entry(StubTaskPayload::class.java, TaskPayloadSensitivity.INTERNAL)
        val malformed =
            TaskPayloadEnvelope(
                schemaVersion = 2,
                taskType = entry.taskType,
                sensitivity = entry.sensitivity,
                createdAtEpochMs = now.toEpochMilli(),
                expiresAtEpochMs = null,
                payloadJson = "not-json",
            )
        assertQuarantined(TaskQuarantineReason.MALFORMED_PAYLOAD) {
            codec.decode(objectMapper.writeValueAsString(malformed), metadata(payload, entry.taskType), entry)
        }

        val expiringPayload =
            ExpiringStubTaskPayload(
                uid = UUID.randomUUID(),
                aggregateType = "Member",
                aggregateId = 48L,
                expiresAt = now.minusSeconds(1),
            )
        val expiringEntry = entry(ExpiringStubTaskPayload::class.java, TaskPayloadSensitivity.EXPIRING_SECRET)
        val expired = envelopeJson(expiringPayload, expiringEntry, schemaVersion = 2)
        assertQuarantined(TaskQuarantineReason.EXPIRED_PAYLOAD) {
            codec.decode(expired, metadata(expiringPayload, expiringEntry.taskType), expiringEntry)
        }
    }

    @Test
    fun `expiry metadata mismatch는 schema별 exact rule로 quarantine한다`() {
        val payload =
            ExpiringStubTaskPayload(
                uid = UUID.randomUUID(),
                aggregateType = "Member",
                aggregateId = 49L,
                expiresAt = now.plusSeconds(300),
            )
        val internalEntry = entry(ExpiringStubTaskPayload::class.java, TaskPayloadSensitivity.INTERNAL)
        assertQuarantined(TaskQuarantineReason.SENSITIVITY_MISMATCH) {
            codec.decode(envelopeJson(payload, internalEntry, 2), metadata(payload, internalEntry.taskType), internalEntry)
        }

        val expiringEntry = entry(ExpiringStubTaskPayload::class.java, TaskPayloadSensitivity.EXPIRING_SECRET)
        val mismatchedV2 =
            envelopeJson(
                payload,
                expiringEntry,
                schemaVersion = 2,
                expiresAtEpochMs = payload.expiresAt.plusSeconds(1).toEpochMilli(),
            )
        assertQuarantined(TaskQuarantineReason.METADATA_MISMATCH) {
            codec.decode(mismatchedV2, metadata(payload, expiringEntry.taskType), expiringEntry)
        }

        val nonExpiringPayload = StubTaskPayload(UUID.randomUUID(), "Member", 50L, "no-expiry")
        val secretEntry = entry(StubTaskPayload::class.java, TaskPayloadSensitivity.EXPIRING_SECRET)
        assertQuarantined(TaskQuarantineReason.SENSITIVITY_MISMATCH) {
            codec.decode(envelopeJson(nonExpiringPayload, secretEntry, 2), metadata(nonExpiringPayload, secretEntry.taskType), secretEntry)
        }
    }

    @Test
    fun `enqueue는 expiring secret expiry를 exact하게 검증하고 round trip한다`() {
        val validPayload =
            ExpiringStubTaskPayload(
                uid = UUID.randomUUID(),
                aggregateType = "Member",
                aggregateId = 51L,
                expiresAt = now.plusSeconds(300),
            )
        val secretEntry = entry(ExpiringStubTaskPayload::class.java, TaskPayloadSensitivity.EXPIRING_SECRET)

        val encoded = codec.encode(validPayload, secretEntry)
        assertThat(codec.decode(encoded, metadata(validPayload, secretEntry.taskType), secretEntry))
            .isEqualTo(validPayload)

        val internalEntry = entry(ExpiringStubTaskPayload::class.java, TaskPayloadSensitivity.INTERNAL)
        assertThatThrownBy { codec.encode(validPayload, internalEntry) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Only EXPIRING_SECRET task payloads may declare expiresAt")

        val nonExpiringPayload = StubTaskPayload(UUID.randomUUID(), "Member", 52L, "no-expiry")
        val nonExpiringSecretEntry = entry(StubTaskPayload::class.java, TaskPayloadSensitivity.EXPIRING_SECRET)
        assertThatThrownBy { codec.encode(nonExpiringPayload, nonExpiringSecretEntry) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("EXPIRING_SECRET task payload must declare expiresAt")

        val expiredPayload = validPayload.copy(aggregateId = 53L, expiresAt = now)
        assertThatThrownBy { codec.encode(expiredPayload, secretEntry) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Cannot enqueue an expired task payload")
    }

    private fun <T : TaskPayload> entry(
        payloadClass: Class<T>,
        sensitivity: TaskPayloadSensitivity,
    ): TaskHandlerEntry =
        directEntry(
            payloadClass = payloadClass,
            sensitivity = sensitivity,
        )

    private fun directEntry(
        payloadClass: Class<out TaskPayload>,
        sensitivity: TaskPayloadSensitivity,
    ): TaskHandlerEntry {
        val handler = StubTaskHandler()
        return TaskHandlerEntry(
            taskType = TASK_TYPE,
            payloadClass = payloadClass,
            handlerMethod =
                TaskHandlerMethod(
                    bean = handler,
                    method = StubTaskHandler::class.java.getDeclaredMethod("handle", TaskPayload::class.java),
                ),
            retryPolicy = TaskRetryPolicy("test", 3, 1, 2.0, 10),
            schemaVersion = 2,
            sensitivity = sensitivity,
        )
    }

    private fun envelopeJson(
        payload: TaskPayload,
        entry: TaskHandlerEntry,
        schemaVersion: Int,
        taskType: String = entry.taskType,
        createdAtEpochMs: Long = now.toEpochMilli(),
        expiresAtEpochMs: Long? = (payload as? ExpiringTaskPayload)?.expiresAt?.toEpochMilli(),
    ): String =
        objectMapper.writeValueAsString(
            TaskPayloadEnvelope(
                schemaVersion = schemaVersion,
                taskType = taskType,
                sensitivity = entry.sensitivity,
                createdAtEpochMs = createdAtEpochMs,
                expiresAtEpochMs = expiresAtEpochMs,
                payloadJson = objectMapper.writeValueAsString(payload),
            ),
        )

    private fun flatV1EnvelopeJson(
        payload: TaskPayload,
        entry: TaskHandlerEntry,
        expiresAtEpochMs: Long? = null,
    ): String {
        val root = objectMapper.readTree(objectMapper.writeValueAsString(payload)) as tools.jackson.databind.node.ObjectNode
        root.put("schemaVersion", 1)
        root.put("taskType", entry.taskType)
        root.put("sensitivity", entry.sensitivity.name)
        root.put("createdAtEpochMs", now.toEpochMilli())
        if (expiresAtEpochMs == null) {
            root.putNull("expiresAtEpochMs")
        } else {
            root.put("expiresAtEpochMs", expiresAtEpochMs)
        }
        return objectMapper.writeValueAsString(root)
    }

    private fun metadata(
        payload: TaskPayload,
        taskType: String,
    ): StoredTaskPayloadMetadata =
        StoredTaskPayloadMetadata(
            uid = payload.uid,
            aggregateType = payload.aggregateType,
            aggregateId = payload.aggregateId,
            taskType = taskType,
        )

    private fun assertQuarantined(
        reason: TaskQuarantineReason,
        block: () -> Unit,
    ) {
        assertThatThrownBy(block)
            .isInstanceOf(TaskPayloadQuarantineException::class.java)
            .extracting { exception -> (exception as TaskPayloadQuarantineException).reason }
            .isEqualTo(reason)
    }

    private data class StubTaskPayload(
        override val uid: UUID,
        override val aggregateType: String,
        override val aggregateId: Long,
        val value: String,
    ) : TaskPayload

    private data class ExpiringStubTaskPayload(
        override val uid: UUID,
        override val aggregateType: String,
        override val aggregateId: Long,
        override val expiresAt: Instant,
    ) : ExpiringTaskPayload

    private data class OtherTaskPayload(
        override val uid: UUID,
        override val aggregateType: String,
        override val aggregateId: Long,
    ) : TaskPayload

    private class StubTaskHandler {
        fun handle(payload: TaskPayload) = Unit
    }

    private companion object {
        const val TASK_TYPE = "test.payload-envelope"
    }
}
