package com.back.global.task.application

import com.back.global.app.application.AppFacade
import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.domain.Task
import com.back.standard.dto.TaskPayload
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
import java.util.*

/**
 * TaskFacade는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */

@Service
class TaskFacade(
    private val taskRepository: TaskRepository,
    private val taskHandlerRegistry: TaskHandlerRegistry,
    private val objectMapper: ObjectMapper,
    @param:Value("\${custom.task.processor.inlineWhenNotProd:false}")
    private val inlineWhenNotProd: Boolean,
) {
    /**
     * 작업 큐에 태스크를 등록하고 실행 파라미터를 표준화합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    fun addToQueue(payload: TaskPayload) {
        val entry =
            taskHandlerRegistry.getEntry(payload.javaClass)
                ?: error("No @TaskHandler registered for ${payload.javaClass.simpleName}")

        val task =
            taskRepository.save(
                Task(
                    UUID.randomUUID(),
                    payload.aggregateType,
                    payload.aggregateId,
                    entry.taskType,
                    objectMapper.writeValueAsString(payload),
                    entry.retryPolicy.maxRetries,
                ),
            )

        if (AppFacade.isNotProd && inlineWhenNotProd) {
            fire(payload)
            task.markAsCompleted()
            taskRepository.save(task)
        }
    }

    fun fire(payload: TaskPayload) {
        val handler = taskHandlerRegistry.getHandler(payload.javaClass)
        handler?.method?.invoke(handler.bean, payload)
    }
}
