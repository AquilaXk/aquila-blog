package com.back.global.task.application

import com.back.boundedContexts.post.application.service.PostAttachmentObjectKeySnapshot
import com.back.boundedContexts.post.application.service.PostRecommendationSideEffect
import com.back.boundedContexts.post.application.service.PostWriteSideEffectPayload
import com.back.boundedContexts.post.dto.PostSearchIndexSyncPayload
import com.back.global.app.AppConfig
import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.standard.dto.TaskPayload
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
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
    fun `attachment snapshot은 sync와 delete content 동시 지정을 거부한다`() {
        assertThatThrownBy {
            PostAttachmentObjectKeySnapshot.fromContents(
                previousContent = null,
                currentContent = "current",
                deletedContent = "deleted",
            )
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessage("Post attachment task cannot sync and delete in one payload")
    }

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
    fun `search index v2 payload omits retired force clear field and rejects historical field`() {
        val payload =
            PostSearchIndexSyncPayload(
                uid = UUID.randomUUID(),
                aggregateType = "Post",
                aggregateId = 43L,
                postId = 43L,
                enqueuedAtEpochMs = now.toEpochMilli(),
            )
        val entry = searchIndexEntry()
        val freshEnvelope = objectMapper.readValue(codec.encode(payload, entry), TaskPayloadEnvelope::class.java)

        assertThat(freshEnvelope.payloadJson).doesNotContain("forceClear")

        val historicalV2 =
            objectMapper.writeValueAsString(
                TaskPayloadEnvelope(
                    schemaVersion = 2,
                    taskType = entry.taskType,
                    sensitivity = entry.sensitivity,
                    createdAtEpochMs = now.toEpochMilli(),
                    expiresAtEpochMs = null,
                    payloadJson =
                        objectMapper.writeValueAsString(
                            mapOf(
                                "uid" to payload.uid,
                                "aggregateType" to payload.aggregateType,
                                "aggregateId" to payload.aggregateId,
                                "postId" to payload.postId,
                                "forceClear" to true,
                                "enqueuedAtEpochMs" to payload.enqueuedAtEpochMs,
                            ),
                        ),
                ),
            )
        assertThatThrownBy {
            codec.decode(historicalV2, metadata(payload, entry.taskType), entry)
        }.isInstanceOf(TaskPayloadQuarantineException::class.java)
            .extracting { exception -> (exception as TaskPayloadQuarantineException).reason }
            .isEqualTo(TaskQuarantineReason.MALFORMED_PAYLOAD)
    }

    private fun postWriteEntry(): TaskHandlerEntry =
        entry(
            taskType = PostWriteSideEffectPayload.TASK_TYPE,
            payloadClass = PostWriteSideEffectPayload::class.java,
            sensitivity = TaskPayloadSensitivity.PERSONAL,
        )

    private fun searchIndexEntry(): TaskHandlerEntry =
        entry(
            taskType = "post.search-index.sync",
            payloadClass = PostSearchIndexSyncPayload::class.java,
            sensitivity = TaskPayloadSensitivity.PUBLIC,
        )

    private fun entry(
        taskType: String,
        payloadClass: Class<out TaskPayload>,
        sensitivity: TaskPayloadSensitivity,
    ): TaskHandlerEntry =
        TaskHandlerEntry.withCurrentDecoder(
            taskType = taskType,
            payloadClass = payloadClass,
            handlerMethod =
                TaskHandlerMethod(
                    bean = StubHandler(),
                    method = StubHandler::class.java.getDeclaredMethod("handle", TaskPayload::class.java),
                ),
            retryPolicy = TaskRetryPolicy("test", 3, 1, 2.0, 10),
            schemaVersion = 2,
            sensitivity = sensitivity,
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
