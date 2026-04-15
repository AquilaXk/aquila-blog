package com.back.global.system.application

import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupMailDiagnosticsService
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.security.domain.AuthSecurityEventType
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.task.application.TaskQueueDiagnosticsService
import org.springframework.stereotype.Service
import java.time.Instant

data class AdminDashboardTaskQueueSnapshot(
    val pendingCount: Long,
    val readyPendingCount: Long,
    val processingCount: Long,
    val failedCount: Long,
    val staleProcessingCount: Long,
    val oldestReadyPendingAgeSeconds: Long?,
    val latestFailureAt: Instant?,
    val latestFailureMessage: String?,
)

data class AdminDashboardSignupMailSnapshot(
    val status: String,
    val queueLagSeconds: Long?,
    val latestFailureAt: Instant?,
    val latestFailureMessage: String?,
)

data class AdminDashboardAuthSecuritySnapshot(
    val recentEventCount: Int,
    val blockedEventCount: Int,
    val latestEventAt: Instant?,
    val latestBlockedAt: Instant?,
)

data class AdminDashboardStorageCleanupSnapshot(
    val eligibleForPurgeCount: Long,
    val blockedBySafetyThreshold: Boolean,
    val oldestEligiblePurgeAfter: Instant?,
)

data class AdminDashboardSnapshot(
    val generatedAt: Instant,
    val taskQueue: AdminDashboardTaskQueueSnapshot,
    val signupMail: AdminDashboardSignupMailSnapshot,
    val authSecurity: AdminDashboardAuthSecuritySnapshot,
    val storageCleanup: AdminDashboardStorageCleanupSnapshot,
)

@Service
class AdminDashboardSnapshotService(
    private val taskQueueDiagnosticsService: TaskQueueDiagnosticsService,
    private val signupMailDiagnosticsService: SignupMailDiagnosticsService,
    private val authSecurityEventService: AuthSecurityEventService,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
) {
    fun getSnapshot(): AdminDashboardSnapshot {
        val generatedAt = Instant.now()
        val taskQueue = taskQueueDiagnosticsService.diagnoseQueue()
        val signupMail = signupMailDiagnosticsService.diagnose(checkConnection = false)
        val authEvents = authSecurityEventService.getRecent(30)
        val cleanup = uploadedFileRetentionService.diagnoseCleanup()
        val latestFailure = taskQueue.recentFailures.firstOrNull()
        val latestTaskTypeFailure = taskQueue.taskTypes.firstOrNull { it.latestFailureAt != null }
        val latestBlockedEvent =
            authEvents.firstOrNull {
                it.eventType == AuthSecurityEventType.IP_SECURITY_MISMATCH_BLOCKED.name
            }

        return AdminDashboardSnapshot(
            generatedAt = generatedAt,
            taskQueue =
                AdminDashboardTaskQueueSnapshot(
                    pendingCount = taskQueue.pendingCount,
                    readyPendingCount = taskQueue.readyPendingCount,
                    processingCount = taskQueue.processingCount,
                    failedCount = taskQueue.failedCount,
                    staleProcessingCount = taskQueue.staleProcessingCount,
                    oldestReadyPendingAgeSeconds = taskQueue.oldestReadyPendingAgeSeconds,
                    latestFailureAt = latestFailure?.modifiedAt ?: latestTaskTypeFailure?.latestFailureAt,
                    latestFailureMessage = latestFailure?.errorMessage ?: latestTaskTypeFailure?.latestFailureMessage,
                ),
            signupMail =
                AdminDashboardSignupMailSnapshot(
                    status = signupMail.status,
                    queueLagSeconds = signupMail.taskQueue.queueLagSeconds,
                    latestFailureAt = signupMail.taskQueue.latestFailureAt,
                    latestFailureMessage = signupMail.taskQueue.latestFailureMessage,
                ),
            authSecurity =
                AdminDashboardAuthSecuritySnapshot(
                    recentEventCount = authEvents.size,
                    blockedEventCount =
                        authEvents.count {
                            it.eventType == AuthSecurityEventType.IP_SECURITY_MISMATCH_BLOCKED.name
                        },
                    latestEventAt = authEvents.firstOrNull()?.createdAt,
                    latestBlockedAt = latestBlockedEvent?.createdAt,
                ),
            storageCleanup =
                AdminDashboardStorageCleanupSnapshot(
                    eligibleForPurgeCount = cleanup.eligibleForPurgeCount,
                    blockedBySafetyThreshold = cleanup.blockedBySafetyThreshold,
                    oldestEligiblePurgeAfter = cleanup.oldestEligiblePurgeAfter,
                ),
        )
    }
}
