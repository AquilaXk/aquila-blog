package com.back.global.task.config

import com.back.global.task.annotation.Task
import com.back.global.task.annotation.TaskHandler
import com.back.global.task.app.TaskHandlerEntry
import com.back.global.task.app.TaskHandlerMethod
import com.back.global.task.app.TaskHandlerRegistry
import com.back.global.task.app.TaskRetryPolicy
import com.back.standard.dto.TaskPayload
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory
import org.springframework.context.ApplicationContext
import org.springframework.context.ApplicationListener
import org.springframework.context.event.ContextRefreshedEvent
import org.springframework.stereotype.Component

@Component
class TaskHandlerConfigurer(
    private val applicationContext: ApplicationContext,
    private val taskHandlerRegistry: TaskHandlerRegistry,
) : ApplicationListener<ContextRefreshedEvent> {
    override fun onApplicationEvent(event: ContextRefreshedEvent) {
        val beanFactory = applicationContext.autowireCapableBeanFactory as? ConfigurableListableBeanFactory
        applicationContext.beanDefinitionNames.forEach { beanName ->
            if (beanFactory != null && !beanFactory.isSingleton(beanName)) return@forEach
            val bean = applicationContext.getBean(beanName)

            bean::class.java.methods
                .filter { it.isAnnotationPresent(TaskHandler::class.java) }
                .forEach { method ->
                    val parameterTypes = method.parameterTypes

                    if (parameterTypes.size == 1 && TaskPayload::class.java.isAssignableFrom(parameterTypes[0])) {
                        @Suppress("UNCHECKED_CAST")
                        val payloadClass = parameterTypes[0] as Class<out TaskPayload>
                        val taskAnnotation =
                            payloadClass.getAnnotation(Task::class.java)
                                ?: error("No @Task annotation on ${payloadClass.simpleName}")

                        taskHandlerRegistry.register(
                            taskAnnotation.type,
                            TaskHandlerEntry(
                                taskType = taskAnnotation.type,
                                payloadClass = payloadClass,
                                handlerMethod = TaskHandlerMethod(bean, method),
                                retryPolicy =
                                    TaskRetryPolicy(
                                        label = taskAnnotation.label.ifBlank { taskAnnotation.type },
                                        maxRetries = taskAnnotation.maxRetries,
                                        baseDelaySeconds = taskAnnotation.baseDelaySeconds,
                                        backoffMultiplier = taskAnnotation.backoffMultiplier,
                                        maxDelaySeconds = taskAnnotation.maxDelaySeconds,
                                    ),
                            ),
                        )
                    }
                }
        }
    }
}
