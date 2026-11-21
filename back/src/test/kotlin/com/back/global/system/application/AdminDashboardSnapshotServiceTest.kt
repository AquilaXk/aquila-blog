package com.back.global.system.application

import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.AdmPostFacetCounts
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.storage.application.UploadedFileCleanupSummary
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.task.application.TaskQueueDiagnostics
import com.back.global.task.application.TaskQueueDiagnosticsService
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock

@DisplayName("AdminDashboardSnapshotService 테스트")
class AdminDashboardSnapshotServiceTest {
    private val taskQueueDiagnosticsService = mock(TaskQueueDiagnosticsService::class.java)
    private val authSecurityEventService = mock(AuthSecurityEventService::class.java)
    private val uploadedFileRetentionService = mock(UploadedFileRetentionService::class.java)
    private val postUseCase = mock(PostUseCase::class.java)

    private val service =
        AdminDashboardSnapshotService(
            taskQueueDiagnosticsService = taskQueueDiagnosticsService,
            authSecurityEventService = authSecurityEventService,
            uploadedFileRetentionService = uploadedFileRetentionService,
            postUseCase = postUseCase,
        )

    @Test
    @DisplayName("dashboard snapshot은 단일 패스 post facet 집계 결과를 content snapshot으로 매핑한다")
    fun getSnapshotMapsContentFacetCounts() {
        val taskDiagnostics =
            TaskQueueDiagnostics(
                pendingCount = 2,
                readyPendingCount = 1,
                delayedPendingCount = 1,
                processingCount = 0,
                completedCount = 10,
                failedCount = 0,
                staleProcessingCount = 0,
                oldestReadyPendingAt = null,
                oldestProcessingAt = null,
                oldestReadyPendingAgeSeconds = null,
                oldestProcessingAgeSeconds = null,
                processingTimeoutSeconds = 60,
                taskTypes = emptyList(),
                recentFailures = emptyList(),
                staleProcessingSamples = emptyList(),
            )
        val cleanupSummary =
            UploadedFileCleanupSummary(
                eligibleForPurgeCount = 5,
                blockedBySafetyThreshold = false,
                oldestEligiblePurgeAfter = null,
            )
        val facet =
            AdmPostFacetCounts(
                all = 25,
                published = 18,
                draft = 4,
                privateCount = 3,
                unlisted = 2,
                deleted = 5,
                totalHitCount = 1200,
                totalLikesCount = 350,
            )

        given(taskQueueDiagnosticsService.diagnoseQueue()).willReturn(taskDiagnostics)
        given(authSecurityEventService.getRecent(30)).willReturn(emptyList())
        given(uploadedFileRetentionService.diagnoseCleanupSummary()).willReturn(cleanupSummary)
        given(postUseCase.getAdminPostFacetCounts()).willReturn(facet)

        val snapshot = service.getSnapshot()

        assertThat(snapshot.content.totalPosts).isEqualTo(25)
        assertThat(snapshot.content.publishedPosts).isEqualTo(18)
        assertThat(snapshot.content.draftPosts).isEqualTo(4)
        assertThat(snapshot.content.privatePosts).isEqualTo(3)
        assertThat(snapshot.content.deletedPosts).isEqualTo(5)
        assertThat(snapshot.content.totalHitCount).isEqualTo(1200)
        assertThat(snapshot.content.totalLikesCount).isEqualTo(350)
    }
}
