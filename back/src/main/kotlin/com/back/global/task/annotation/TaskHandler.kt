package com.back.global.task.annotation

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
/**
 * TaskHandler는 글로벌 동작 확장을 위한 커스텀 애너테이션입니다.
 * 핸들러 바인딩/스캔 시점 메타데이터를 일관되게 제공합니다.
 */

annotation class TaskHandler
