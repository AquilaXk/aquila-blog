package com.back.global.task.app

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
)

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

    fun getRetryPolicy(taskType: String): TaskRetryPolicy = byType[taskType]?.retryPolicy ?: TaskRetryPolicy.fallback(taskType)

    fun getRegisteredEntries(): List<TaskHandlerEntry> = byType.values.sortedBy { it.taskType }
}
