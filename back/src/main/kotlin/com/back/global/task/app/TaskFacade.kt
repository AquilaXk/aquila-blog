package com.back.global.task.app

import com.back.global.app.app.AppFacade
import com.back.global.task.domain.Task
import com.back.global.task.out.TaskRepository
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
        val type = taskHandlerRegistry.getType(payload.javaClass)
            ?: error("No @TaskHandler registered for ${payload.javaClass.simpleName}")

        val task = taskRepository.save(
            Task(
                UUID.randomUUID(),
                payload.aggregateType,
                payload.aggregateId,
                type,
                Ut.JSON.toString(payload)
            )
        )

        if (AppFacade.isNotProd) {
            fire(payload)
            task.markAsCompleted()
        }
    }

    fun fire(payload: TaskPayload) {
        val handler = taskHandlerRegistry.getHandler(payload.javaClass)
        handler?.method?.invoke(handler.bean, payload)
    }
}
