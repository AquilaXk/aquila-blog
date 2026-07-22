package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.boundedContexts.cloud.application.service.CloudFileReconcileDiagnostics
import com.back.boundedContexts.cloud.application.service.CloudFileReconcileService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.then
import org.mockito.Mockito.doReturn
import org.mockito.Mockito.mock
import org.springframework.scheduling.annotation.Scheduled

@DisplayName("클라우드 파일 reconcile 스케줄러 테스트")
class CloudFileReconcileScheduledJobTest {
    @Test
    @DisplayName("reconcile 잡은 CloudFileReconcileService.reconcile을 호출한다")
    fun `reconcile 잡은 CloudFileReconcileService reconcile을 호출한다`() {
        val service = mock(CloudFileReconcileService::class.java)
        val diagnostics =
            CloudFileReconcileDiagnostics(
                objectPrefix = "cloud/",
                inventoryLimit = 1000,
                inventoryObjectCount = 0,
                inventoryTruncated = false,
                bucketOnlyObjectCount = 1,
                sampleBucketOnlyObjectKeys = listOf("cloud/orphan"),
                dbOnlyMissingObjectCount = 0,
                sampleDbOnlyObjectKeys = emptyList(),
            )
        doReturn(diagnostics).`when`(service).reconcile()
        val job = CloudFileReconcileScheduledJob(service)

        job.reconcileCloudFiles()

        then(service).should().reconcile()
    }

    @Test
    @DisplayName("reconcile 잡은 ShedLock과 기본 1시간 주기를 사용한다")
    fun `reconcile 잡은 ShedLock과 기본 1시간 주기를 사용한다`() {
        val method = CloudFileReconcileScheduledJob::class.java.getDeclaredMethod("reconcileCloudFiles")
        val scheduled = method.getAnnotation(Scheduled::class.java)
        val lock = method.getAnnotation(SchedulerLock::class.java)

        assertThat(scheduled.fixedDelayString)
            .isEqualTo("\${custom.storage.cloudReconcileFixedDelayMs:3600000}")
        assertThat(lock.name).isEqualTo("cloudFileReconcile")
        assertThat(lock.lockAtLeastFor).isEqualTo("PT1M")
    }
}
