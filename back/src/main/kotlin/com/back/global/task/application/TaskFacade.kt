package com.back.global.task.application

import com.back.global.app.application.AppFacade
import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.domain.Task
import com.back.standard.dto.TaskPayload
import com.back.standard.util.Ut
import org.springframework.stereotype.Service
import java.util.*

@Service
class TaskFacade(
    private val taskRepository: TaskRepository,
    private val taskHandlerRegistry: TaskHandlerRegistry,
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
                    Ut.JSON.toString(payload),
                    entry.retryPolicy.maxRetries,
                ),
            )

        if (AppFacade.isNotProd) {
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
