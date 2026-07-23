package com.back.boundedContexts.member.subContexts.privacy.job

import com.back.boundedContexts.member.subContexts.memberActionLog.application.port.output.MemberActionLogRepositoryPort
import com.back.boundedContexts.member.subContexts.notification.application.port.output.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberPrivacyRequestRepositoryPort
import com.back.boundedContexts.member.subContexts.signupVerification.application.port.output.MemberSignupVerificationRepositoryPort
import io.micrometer.core.instrument.MeterRegistry
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Instant
import java.time.temporal.ChronoUnit

@Component
@ConditionalOnProperty(
    prefix = "custom.runtime",
    name = ["worker-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class PrivacyRetentionCleanupScheduledJob(
    private val signupVerificationRepository: MemberSignupVerificationRepositoryPort,
    private val memberActionLogRepository: MemberActionLogRepositoryPort,
    private val memberNotificationRepository: MemberNotificationRepositoryPort,
    private val memberPrivacyRequestRepository: MemberPrivacyRequestRepositoryPort,
    private val meterRegistry: MeterRegistry?,
    @param:Value("\${custom.privacy.retention.signupVerificationDays:7}")
    private val signupVerificationDays: Int,
    @param:Value("\${custom.privacy.retention.memberActionLogDays:90}")
    private val memberActionLogDays: Int,
    @param:Value("\${custom.privacy.retention.notificationDays:60}")
    private val notificationDays: Int,
    @param:Value("\${custom.privacy.retention.privacyRequestDays:30}")
    private val privacyRequestDays: Int,
    @param:Value("\${custom.privacy.retention.cleanup.batchSize:500}")
    private val batchSize: Int,
    @param:Value("\${custom.privacy.retention.cleanup.maxBatches:20}")
    private val maxBatches: Int,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${custom.privacy.retention.cleanup.fixedDelayMs:3600000}")
    @SchedulerLock(name = "privacyRetentionCleanup", lockAtLeastFor = "PT1M")
    fun cleanup() {
        cleanup(Instant.now())
    }

    fun cleanup(now: Instant) {
        purge("signup_verification", now, signupVerificationDays, signupVerificationRepository::deleteRetainedBefore)
        purge("member_action_log", now, memberActionLogDays, memberActionLogRepository::deleteCreatedBefore)
        purge("notification", now, notificationDays, memberNotificationRepository::deleteCreatedBefore)
        purge("privacy_request", now, privacyRequestDays, memberPrivacyRequestRepository::deleteClosedBefore)
    }

    private fun purge(
        target: String,
        now: Instant,
        days: Int,
        deleteBefore: (Instant, Int) -> Int,
    ) {
        val cutoff = now.minus(days.coerceAtLeast(1).toLong(), ChronoUnit.DAYS)
        val normalizedBatchSize = batchSize.coerceIn(1, 1_000)
        val normalizedMaxBatches = maxBatches.coerceIn(1, 100)
        var totalDeleted = 0
        var completedBatches = 0

        try {
            while (completedBatches < normalizedMaxBatches) {
                val deleted = deleteBefore(cutoff, normalizedBatchSize)
                if (deleted <= 0) break
                totalDeleted += deleted
                completedBatches += 1
                if (deleted < normalizedBatchSize) break
            }
            if (totalDeleted > 0) {
                meterRegistry?.counter("privacy.retention.cleanup.deleted", "target", target)?.increment(totalDeleted.toDouble())
                log.info("privacy_retention_cleanup_deleted target={} count={}", target, totalDeleted)
            }
        } catch (ex: RuntimeException) {
            meterRegistry?.counter("privacy.retention.cleanup.failed", "target", target)?.increment()
            log.error("privacy_retention_cleanup_failed target={}", target, ex)
        }
    }
}
