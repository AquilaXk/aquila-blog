package com.back.global.task.application

import com.back.boundedContexts.post.application.service.PostAttachmentObjectKeySnapshot
import com.back.boundedContexts.post.application.service.PostRecommendationSideEffect
import com.back.boundedContexts.post.application.service.PostWriteSideEffectPayload
import com.back.boundedContexts.post.application.service.PostWriteSideEffectPayloadV1
import com.back.boundedContexts.post.dto.PostSearchIndexSyncPayload
import com.back.boundedContexts.post.dto.PostSearchIndexSyncPayloadV1
import com.back.global.app.AppConfig
import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.standard.dto.TaskPayload
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import tools.jackson.databind.node.ObjectNode
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.lang.reflect.Field
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class TaskPayloadPrivacyContractTest {
    private val now = Instant.parse("2026-08-11T00:00:00Z")
    private val objectMapper = jacksonObjectMapper()
    private val codec = TaskPayloadEnvelopeCodec(objectMapper, Clock.fixed(now, ZoneOffset.UTC))

    @Test
    fun `post write v2 envelope은 full body 대신 attachment object key만 저장한다`() {
        val bodySentinel = "private-full-post-body"
        val attachmentKeys =
            withIsolatedAppConfig {
                PostAttachmentObjectKeySnapshot.fromContents(
                    previousContent = null,
                    currentContent = "$bodySentinel ![image](/post/api/v1/images/posts/private.png)",
                    deletedContent = null,
                )
            }
        val payload =
            PostWriteSideEffectPayload(
                uid = UUID.randomUUID(),
                aggregateType = "Post",
                aggregateId = 41L,
                postId = 41L,
                attachmentKeys = attachmentKeys,
                beforeTags = emptyList(),
                afterTags = emptyList(),
                cacheInvalidationTargets = emptySet(),
                evictReason = "test",
                recommendationAction = PostRecommendationSideEffect.NONE,
                domainEventType = null,
                domainEventJson = null,
            )
        val entry = postWriteEntry()

        val envelope = objectMapper.readValue(codec.encode(payload, entry), TaskPayloadEnvelope::class.java)

        assertThat(envelope.payloadJson)
            .contains("posts/private.png")
            .doesNotContain(bodySentinel)
            .doesNotContain("previousContent")
            .doesNotContain("currentContent")
            .doesNotContain("deletedContent")
    }

    @Test
    fun `post write v1은 exact legacy decoder 한 번으로 object key snapshot으로 전환한다`() {
        val bodySentinel = "legacy-private-full-post-body"
        val legacy =
            PostWriteSideEffectPayloadV1(
                uid = UUID.randomUUID(),
                aggregateType = "Post",
                aggregateId = 42L,
                postId = 42L,
                previousContent = null,
                currentContent = "$bodySentinel [file](/post/api/v1/files/posts/manual.pdf)",
                deletedContent = null,
                beforeTags = emptyList(),
                afterTags = emptyList(),
                cacheInvalidationTargets = emptySet(),
                evictReason = "legacy-test",
                recommendationAction = PostRecommendationSideEffect.NONE,
                domainEventType = null,
                domainEventJson = null,
            )
        val entry = postWriteEntry()

        val decoded =
            withIsolatedAppConfig {
                codec.decode(v1Envelope(legacy, entry), metadata(legacy, entry.taskType), entry)
            }

        assertThat(decoded).isInstanceOf(PostWriteSideEffectPayload::class.java)
        assertThat((decoded as PostWriteSideEffectPayload).attachmentKeys.currentFileObjectKeys)
            .containsExactly("posts/manual.pdf")
        assertThat(objectMapper.writeValueAsString(decoded)).doesNotContain(bodySentinel)
    }

    @Test
    fun `search v1 fallback tags는 current payload로 전달되지 않고 누락 field는 quarantine한다`() {
        val fallbackSentinel = "legacy-fallback-tag"
        val legacy =
            PostSearchIndexSyncPayloadV1(
                uid = UUID.randomUUID(),
                aggregateType = "Post",
                aggregateId = 43L,
                postId = 43L,
                legacyTags = listOf(fallbackSentinel),
                forceClear = false,
                enqueuedAtEpochMs = now.toEpochMilli(),
            )
        val entry = searchIndexEntry()
        val rawEnvelope = v1Envelope(legacy, entry)

        val decoded = codec.decode(rawEnvelope, metadata(legacy, entry.taskType), entry)

        assertThat(decoded).isInstanceOf(PostSearchIndexSyncPayload::class.java)
        assertThat(objectMapper.writeValueAsString(decoded))
            .doesNotContain("fallbackTags")
            .doesNotContain(fallbackSentinel)

        val malformedPayload =
            objectMapper
                .readTree(objectMapper.writeValueAsString(legacy))
                .let { node -> node as ObjectNode }
                .also { node -> node.remove("fallbackTags") }
        val malformed = v1EnvelopeJson(objectMapper.writeValueAsString(malformedPayload), entry)
        assertThatThrownBy {
            codec.decode(malformed, metadata(legacy, entry.taskType), entry)
        }.isInstanceOf(TaskPayloadQuarantineException::class.java)
            .extracting { exception -> (exception as TaskPayloadQuarantineException).reason }
            .isEqualTo(TaskQuarantineReason.MALFORMED_PAYLOAD)
    }

    private fun postWriteEntry(): TaskHandlerEntry =
        entry(
            taskType = PostWriteSideEffectPayload.TASK_TYPE,
            payloadClass = PostWriteSideEffectPayload::class.java,
            legacyPayloadClass = PostWriteSideEffectPayloadV1::class.java,
            sensitivity = TaskPayloadSensitivity.PERSONAL,
        )

    private fun searchIndexEntry(): TaskHandlerEntry =
        entry(
            taskType = "post.search-index.sync",
            payloadClass = PostSearchIndexSyncPayload::class.java,
            legacyPayloadClass = PostSearchIndexSyncPayloadV1::class.java,
            sensitivity = TaskPayloadSensitivity.PUBLIC,
        )

    private fun entry(
        taskType: String,
        payloadClass: Class<out TaskPayload>,
        legacyPayloadClass: Class<out TaskPayload>,
        sensitivity: TaskPayloadSensitivity,
    ): TaskHandlerEntry =
        TaskHandlerEntry.withExactDecoders(
            taskType = taskType,
            payloadClass = payloadClass,
            legacyPayloadClass = legacyPayloadClass,
            handlerMethod =
                TaskHandlerMethod(
                    bean = StubHandler(),
                    method = StubHandler::class.java.getDeclaredMethod("handle", TaskPayload::class.java),
                ),
            retryPolicy = TaskRetryPolicy("test", 3, 1, 2.0, 10),
            schemaVersion = 2,
            sensitivity = sensitivity,
        )

    private fun v1Envelope(
        payload: TaskPayload,
        entry: TaskHandlerEntry,
    ): String = v1EnvelopeJson(objectMapper.writeValueAsString(payload), entry)

    private fun v1EnvelopeJson(
        payloadJson: String,
        entry: TaskHandlerEntry,
    ): String =
        objectMapper.writeValueAsString(
            TaskPayloadEnvelope(
                schemaVersion = 1,
                taskType = entry.taskType,
                sensitivity = entry.sensitivity,
                createdAtEpochMs = now.toEpochMilli(),
                expiresAtEpochMs = null,
                payloadJson = payloadJson,
            ),
        )

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

    private fun <T> withIsolatedAppConfig(block: () -> T): T {
        val snapshot = appConfigUrlSnapshot()
        AppConfig(
            siteBackUrl = "https://api.aquilaxk.test",
            siteFrontUrl = "https://www.aquilaxk.test",
        )

        return try {
            block()
        } finally {
            appConfigUrlFields.zip(snapshot).forEach { (field, value) -> field.set(null, value) }
        }
    }

    private fun appConfigUrlSnapshot(): List<Any?> = appConfigUrlFields.map { field -> field.get(null) }

    private val appConfigUrlFields: List<Field> by lazy {
        listOf("siteBackUrl", "siteFrontUrl").map { name ->
            AppConfig::class.java.getDeclaredField(name).apply { isAccessible = true }
        }
    }

    private class StubHandler {
        fun handle(payload: TaskPayload) = Unit
    }
}
