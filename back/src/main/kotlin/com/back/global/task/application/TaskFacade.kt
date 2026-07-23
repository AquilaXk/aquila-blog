package com.back.global.task.application

import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.Task
import com.back.standard.dto.TaskPayload
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.env.Environment
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
import java.lang.reflect.InvocationTargetException

@Service
class TaskFacade(
    private val taskRepository: TaskQueueRepositoryPort,
    private val taskHandlerRegistry: TaskHandlerRegistry,
    private val objectMapper: ObjectMapper,
    private val environment: Environment,
    @param:Value("\${custom.task.processor.inlineWhenNotProd:false}")
    private val inlineWhenNotProd: Boolean,
) {
    fun addToQueue(
        payload: TaskPayload,
        inlineWhenEnabled: Boolean = true,
    ) {
        val entry =
            taskHandlerRegistry.getEntry(payload.javaClass)
                ?: error("No @TaskHandler registered for ${payload.javaClass.simpleName}")

        val task =
            saveTaskIdempotently(
                Task(
                    payload.uid,
                    payload.aggregateType,
                    payload.aggregateId,
                    entry.taskType,
                    objectMapper.writeValueAsString(payload),
                    entry.retryPolicy.maxRetries,
                ),
            ) ?: return

        if (inlineWhenEnabled && inlineWhenNotProd && !environment.matchesProfiles("prod")) {
            fire(payload)
            task.markAsCompleted()
            taskRepository.save(task)
        }
    }

    private fun saveTaskIdempotently(task: Task): Task? =
        try {
            taskRepository.save(task)
        } catch (exception: DataIntegrityViolationException) {
            if (taskRepository.existsByUid(task.uid)) {
                null
            } else {
                throw exception
            }
        }

    fun fire(payload: TaskPayload) {
        val handler = taskHandlerRegistry.getHandler(payload.javaClass)
        try {
            handler?.method?.invoke(handler.bean, payload)
        } catch (exception: InvocationTargetException) {
            throw exception.targetException
        }
    }
}
