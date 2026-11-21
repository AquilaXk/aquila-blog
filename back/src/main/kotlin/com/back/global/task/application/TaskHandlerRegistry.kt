package com.back.global.task.application

import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.standard.dto.TaskPayload
import org.springframework.stereotype.Component
import java.lang.reflect.Method

data class TaskHandlerMethod(
    val bean: Any,
    val method: Method,
)

data class TaskHandlerEntry(
    val taskType: String,
    val payloadClass: Class<out TaskPayload>,
    val handlerMethod: TaskHandlerMethod,
    val retryPolicy: TaskRetryPolicy,
    val schemaVersion: Int,
    val sensitivity: TaskPayloadSensitivity,
) {
    init {
        require(schemaVersion == TaskHandlerRegistry.CURRENT_TASK_PAYLOAD_SCHEMA_VERSION) {
            "Current task payload schema must be ${TaskHandlerRegistry.CURRENT_TASK_PAYLOAD_SCHEMA_VERSION}"
        }
    }

    companion object {
        fun withCurrentDecoder(
            taskType: String,
            payloadClass: Class<out TaskPayload>,
            handlerMethod: TaskHandlerMethod,
            retryPolicy: TaskRetryPolicy,
            schemaVersion: Int,
            sensitivity: TaskPayloadSensitivity,
        ): TaskHandlerEntry =
            TaskHandlerEntry(
                taskType = taskType,
                payloadClass = payloadClass,
                handlerMethod = handlerMethod,
                retryPolicy = retryPolicy,
                schemaVersion = schemaVersion,
                sensitivity = sensitivity,
            )
    }
}

@Component
class TaskHandlerRegistry {
    private val byType = mutableMapOf<String, TaskHandlerEntry>()
    private val typeByClass = mutableMapOf<Class<out TaskPayload>, String>()

    internal fun register(
        type: String,
        entry: TaskHandlerEntry,
    ) {
        check(!byType.containsKey(type)) {
            "Duplicate @TaskHandler for type '$type': " +
                "already registered by ${byType[type]!!.handlerMethod.method.declaringClass.simpleName}, " +
                "duplicate found in ${entry.handlerMethod.bean::class.java.simpleName}"
        }
        byType[type] = entry
        typeByClass[entry.payloadClass] = type
    }

    fun getHandler(payloadClass: Class<out TaskPayload>): TaskHandlerMethod? {
        val type = typeByClass[payloadClass] ?: return null
        return byType[type]?.handlerMethod
    }

    fun getType(payloadClass: Class<out TaskPayload>): String? = typeByClass[payloadClass]

    fun getEntry(payloadClass: Class<out TaskPayload>): TaskHandlerEntry? {
        val type = typeByClass[payloadClass] ?: return null
        return byType[type]
    }

    fun getEntry(type: String): TaskHandlerEntry? = byType[type]

    fun getRetryPolicy(taskType: String): TaskRetryPolicy =
        checkNotNull(byType[taskType]) { "No @TaskHandler registered for task type '$taskType'" }.retryPolicy

    fun getRegisteredEntries(): List<TaskHandlerEntry> = byType.values.sortedBy { it.taskType }

    companion object {
        const val CURRENT_TASK_PAYLOAD_SCHEMA_VERSION = 2
    }
}
