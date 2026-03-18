package com.back.global.task.application

import com.back.standard.dto.TaskPayload
import org.springframework.stereotype.Component
import java.lang.reflect.Method

/**
 * TaskHandlerMethod는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
data class TaskHandlerMethod(
    val bean: Any,
    val method: Method,
)

/**
 * TaskHandlerEntry는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
data class TaskHandlerEntry(
    val taskType: String,
    val payloadClass: Class<out TaskPayload>,
    val handlerMethod: TaskHandlerMethod,
    val retryPolicy: TaskRetryPolicy,
)

/**
 * TaskHandlerRegistry는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
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

    /**
     * getHandler 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    fun getHandler(payloadClass: Class<out TaskPayload>): TaskHandlerMethod? {
        val type = typeByClass[payloadClass] ?: return null
        return byType[type]?.handlerMethod
    }

    fun getType(payloadClass: Class<out TaskPayload>): String? = typeByClass[payloadClass]

    /**
     * getEntry 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    fun getEntry(payloadClass: Class<out TaskPayload>): TaskHandlerEntry? {
        val type = typeByClass[payloadClass] ?: return null
        return byType[type]
    }

    fun getEntry(type: String): TaskHandlerEntry? = byType[type]

    fun getRetryPolicy(taskType: String): TaskRetryPolicy = byType[taskType]?.retryPolicy ?: TaskRetryPolicy.fallback(taskType)

    fun getRegisteredEntries(): List<TaskHandlerEntry> = byType.values.sortedBy { it.taskType }
}
