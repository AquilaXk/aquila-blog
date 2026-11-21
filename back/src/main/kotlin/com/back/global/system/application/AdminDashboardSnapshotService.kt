package com.back.global.system.application

import com.back.boundedContexts.post.application.port.input.PostUseCase
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

data class AdminDashboardContentSnapshot(
    val totalPosts: Long,
    val publishedPosts: Long,
    val draftPosts: Long,
    val privatePosts: Long,
    val deletedPosts: Long,
    val totalHitCount: Long,
    val totalLikesCount: Long,
)

data class AdminDashboardSnapshot(
    val generatedAt: Instant,
    val taskQueue: AdminDashboardTaskQueueSnapshot,
    val authSecurity: AdminDashboardAuthSecuritySnapshot,
    val storageCleanup: AdminDashboardStorageCleanupSnapshot,
    val content: AdminDashboardContentSnapshot,
)

@Service
class AdminDashboardSnapshotService(
    private val taskQueueDiagnosticsService: TaskQueueDiagnosticsService,
    private val authSecurityEventService: AuthSecurityEventService,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
    private val postUseCase: PostUseCase,
) {
    fun getSnapshot(): AdminDashboardSnapshot {
        val generatedAt = Instant.now()
        val taskQueue = taskQueueDiagnosticsService.diagnoseQueue()
        val authEvents = authSecurityEventService.getRecent(30)
        val cleanup = uploadedFileRetentionService.diagnoseCleanupSummary()
        val contentFacet = postUseCase.getAdminPostFacetCounts()
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
            content =
                AdminDashboardContentSnapshot(
                    totalPosts = contentFacet.all,
                    publishedPosts = contentFacet.published,
                    draftPosts = contentFacet.draft,
                    privatePosts = contentFacet.privateCount,
                    deletedPosts = contentFacet.deleted,
                    totalHitCount = contentFacet.totalHitCount,
                    totalLikesCount = contentFacet.totalLikesCount,
                ),
        )
    }
}
