package com.back.global.task.config

import com.back.global.task.annotation.Task
import com.back.global.task.annotation.TaskHandler
import com.back.global.task.app.TaskHandlerEntry
import com.back.global.task.app.TaskHandlerMethod
import com.back.global.task.app.TaskHandlerRegistry
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
                        val type = payloadClass.getAnnotation(Task::class.java)?.type
                            ?: error("No @Task annotation on ${payloadClass.simpleName}")

                        taskHandlerRegistry.register(
                            type,
                            TaskHandlerEntry(payloadClass, TaskHandlerMethod(bean, method))
                        )
                    }
                }
        }
    }
}
