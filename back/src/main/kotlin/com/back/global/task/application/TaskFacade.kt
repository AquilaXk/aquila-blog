package com.back.global.task.application

import com.back.global.app.application.AppFacade
import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.domain.Task
import com.back.standard.dto.TaskPayload
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
import java.util.*

@Service
class TaskFacade(
    private val taskRepository: TaskRepository,
    private val taskHandlerRegistry: TaskHandlerRegistry,
    private val objectMapper: ObjectMapper,
    @param:Value("\${custom.task.processor.inlineWhenNotProd:false}")
    private val inlineWhenNotProd: Boolean,
) {
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
