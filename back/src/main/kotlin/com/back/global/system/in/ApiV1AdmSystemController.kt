package com.back.global.system.`in`

import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.lang.management.ManagementFactory
import java.time.Instant

@RestController
@RequestMapping("/system/api/v1/adm")
class ApiV1AdmSystemController(
    private val jdbcTemplate: JdbcTemplate,
    private val stringRedisTemplateProvider: ObjectProvider<StringRedisTemplate>,
) {
    data class HealthChecks(
        val db: String,
        val redis: String,
    )

    data class HealthResBody(
        val status: String,
        val serverTime: String,
        val uptimeMs: Long,
        val version: String,
        val checks: HealthChecks,
    )

    @GetMapping("/health")
    @Transactional(readOnly = true)
    fun health(): HealthResBody {
        val db = checkDb()
        val redis = checkRedis()
        val status = if (db == "UP") "UP" else "DOWN"

        return HealthResBody(
            status = status,
            serverTime = Instant.now().toString(),
            uptimeMs = ManagementFactory.getRuntimeMXBean().uptime,
            version = this::class.java.`package`?.implementationVersion ?: "dev",
            checks =
                HealthChecks(
                    db = db,
                    redis = redis,
                ),
        )
    }

    private fun checkDb(): String =
        try {
            val result = jdbcTemplate.queryForObject("SELECT 1", Int::class.java)
            if (result == 1) "UP" else "DOWN"
        } catch (_: Exception) {
            "DOWN"
        }

    private fun checkRedis(): String {
        val redisTemplate = stringRedisTemplateProvider.getIfAvailable() ?: return "SKIPPED"

        return try {
            val pong = redisTemplate.execute { connection -> connection.ping() }
            if (pong.equals("PONG", ignoreCase = true)) "UP" else "SKIPPED"
        } catch (_: Exception) {
            "SKIPPED"
        }
    }
}
