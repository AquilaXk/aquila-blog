package com.back.global.system.application

import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupMailDiagnosticsService
import com.back.global.system.adapter.web.ApiV1AdmSystemController
import org.springframework.beans.factory.ObjectProvider
import org.springframework.cache.annotation.Cacheable
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.lang.management.ManagementFactory
import java.time.Instant

@Service
class AdminSystemHealthSnapshotService(
    private val jdbcTemplate: JdbcTemplate,
    private val stringRedisTemplateProvider: ObjectProvider<StringRedisTemplate>,
    private val signupMailDiagnosticsService: SignupMailDiagnosticsService,
) {
    @Cacheable(
        cacheNames = [SystemQueryCacheNames.ADMIN_HEALTH_SUMMARY],
        key = "'summary'",
        sync = true,
    )
    fun getHealthSummary(): ApiV1AdmSystemController.HealthResBody = computeHealthSummary()

    fun getFreshHealthSummary(): ApiV1AdmSystemController.HealthResBody = computeHealthSummary()

    private fun computeHealthSummary(): ApiV1AdmSystemController.HealthResBody {
        val db = checkDb()
        val redis = checkRedis()
        val signupMail = signupMailDiagnosticsService.diagnose(checkConnection = false).status
        val status =
            when {
                db != "UP" -> "DOWN"
                redis == "DOWN" -> "DEGRADED"
                signupMail in setOf("MISCONFIGURED", "UNAVAILABLE", "CONNECTION_FAILED", "QUEUE_LOCKED") -> "DEGRADED"
                else -> "UP"
            }

        return ApiV1AdmSystemController.HealthResBody(
            status = status,
            serverTime = Instant.now().toString(),
            uptimeMs = ManagementFactory.getRuntimeMXBean().uptime,
            version = this::class.java.`package`?.implementationVersion ?: "dev",
            checks =
                ApiV1AdmSystemController.HealthChecks(
                    db = db,
                    redis = redis,
                    signupMail = signupMail,
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
        val redisTemplate = stringRedisTemplateProvider.getIfAvailable() ?: return "DISABLED"

        return try {
            val pong =
                redisTemplate.execute { connection ->
                    connection.ping()
                }
            if (pong.equals("PONG", ignoreCase = true)) "UP" else "DOWN"
        } catch (_: Exception) {
            "DOWN"
        }
    }
}
