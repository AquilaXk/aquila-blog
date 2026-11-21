package com.back

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.data.jpa.repository.config.EnableJpaAuditing
import java.util.Locale

@SpringBootApplication
@EnableJpaAuditing
class BackApplication

fun main(args: Array<String>) {
    enforceProdSafeSqlInit()
    runApplication<BackApplication>(*args)
}

private fun enforceProdSafeSqlInit() {
    val activeProfiles = activeProfiles()
    if ("prod" !in activeProfiles) return

    // 운영에서는 Flyway만 스키마 변경 경로로 사용한다.
    // 환경변수/시스템프로퍼티 오염으로 sql.init가 켜져도 부팅 전에 강제로 차단한다.
    System.setProperty("spring.sql.init.mode", "never")
    System.clearProperty("spring.sql.init.schema-locations")
    System.clearProperty("spring.sql.init.data-locations")
    System.clearProperty("spring.sql.init.continue-on-error")
}

private fun activeProfiles(): Set<String> {
    val rawProfiles = mutableListOf<String>()
    System.getenv("SPRING_PROFILES_ACTIVE")?.let(rawProfiles::add)
    System.getProperty("spring.profiles.active")?.let(rawProfiles::add)

    return rawProfiles
        .asSequence()
        .flatMap { raw -> raw.split(',').asSequence() }
        .map { it.trim().lowercase(Locale.getDefault()) }
        .filter { it.isNotEmpty() }
        .toSet()
}
