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
    fun `v2 envelope round trip uses the exact current decoder`() {
        val payload = StubTaskPayload(UUID.randomUUID(), "Post", 41L, "value")
        val entry = entry(StubTaskPayload::class.java, TaskPayloadSensitivity.INTERNAL)

        val encoded = codec.encode(payload, entry)
        val decoded = codec.decode(encoded, metadata(payload, entry.taskType), entry)

        assertThat(decoded).isEqualTo(payload)
        assertThat(entry.decoderFor(1)).isNotSameAs(entry.decoderFor(2))
        assertThat(entry.decoderFor(2)?.schemaVersion).isEqualTo(2)
    }

    @Test
    fun `v1 envelope uses only the registered v1 decoder`() {
        val payload = StubTaskPayload(UUID.randomUUID(), "Post", 42L, "legacy")
        val entry = entry(StubTaskPayload::class.java, TaskPayloadSensitivity.INTERNAL)
        val encoded = envelopeJson(payload, entry, schemaVersion = 1)

        val decoded = codec.decode(encoded, metadata(payload, entry.taskType), entry)

        assertThat(decoded).isEqualTo(payload)
        assertThat(entry.decoderFor(1)?.schemaVersion).isEqualTo(1)
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

    private fun <T : TaskPayload> entry(
        payloadClass: Class<T>,
        sensitivity: TaskPayloadSensitivity,
    ): TaskHandlerEntry {
        val handler = StubTaskHandler()

        @Suppress("UNCHECKED_CAST")
        val typedClass = payloadClass as Class<out TaskPayload>
        return TaskHandlerEntry(
            taskType = TASK_TYPE,
            payloadClass = typedClass,
            handlerMethod =
                TaskHandlerMethod(
                    bean = handler,
                    method = StubTaskHandler::class.java.getDeclaredMethod("handle", TaskPayload::class.java),
                ),
            retryPolicy = TaskRetryPolicy("test", 3, 1, 2.0, 10),
            schemaVersion = 2,
            sensitivity = sensitivity,
            decoders =
                mapOf(
                    1 to TaskPayloadDecoder(1, typedClass),
                    2 to TaskPayloadDecoder(2, typedClass),
                ),
        )
    }

    private fun envelopeJson(
        payload: TaskPayload,
        entry: TaskHandlerEntry,
        schemaVersion: Int,
    ): String {
        val expiry = (payload as? ExpiringTaskPayload)?.expiresAt?.toEpochMilli()
        return objectMapper.writeValueAsString(
            TaskPayloadEnvelope(
                schemaVersion = schemaVersion,
                taskType = entry.taskType,
                sensitivity = entry.sensitivity,
                createdAtEpochMs = now.toEpochMilli(),
                expiresAtEpochMs = expiry,
                payloadJson = objectMapper.writeValueAsString(payload),
            ),
        )
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

    private class StubTaskHandler {
        fun handle(payload: TaskPayload) = Unit
    }

    private companion object {
        const val TASK_TYPE = "test.payload-envelope"
    }
}
