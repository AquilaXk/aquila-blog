package com.back.global.task.config

import com.back.global.task.annotation.Task
import com.back.global.task.annotation.TaskHandler
import com.back.global.task.application.TaskHandlerEntry
import com.back.global.task.application.TaskHandlerMethod
import com.back.global.task.application.TaskHandlerRegistry
import com.back.global.task.application.TaskRetryPolicy
import com.back.standard.dto.TaskPayload
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory
import org.springframework.context.ApplicationContext
import org.springframework.context.ApplicationListener
import org.springframework.context.event.ContextRefreshedEvent
import org.springframework.stereotype.Component

/**
 * TaskHandlerConfigurer는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */
@Component
class TaskHandlerConfigurer(
    private val applicationContext: ApplicationContext,
    private val taskHandlerRegistry: TaskHandlerRegistry,
) : ApplicationListener<ContextRefreshedEvent> {
    /**
     * onApplicationEvent 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
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
