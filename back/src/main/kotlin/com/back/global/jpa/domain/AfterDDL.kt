package com.back.global.jpa.domain

/**
 * AfterDDL는 글로벌 모듈 도메인 상태와 규칙을 표현하는 모델입니다.
 * 불변조건을 유지하며 상태 전이를 메서드 단위로 캡슐화합니다.
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@Repeatable
annotation class AfterDDL(
    val sql: String,
)
