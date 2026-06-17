package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.boundedContexts.cloud.application.service.CloudVideoUploadSessionService
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock

@DisplayName("관리자 클라우드 대용량 동영상 세션 정리 스케줄러 테스트")
class CloudVideoUploadSessionCleanupScheduledJobTest {
    @Test
    @DisplayName("만료 세션 정리 작업은 설정된 batch size로 서비스 정리를 호출한다")
    fun `만료 세션 정리 작업은 설정된 batch size로 서비스 정리를 호출한다`() {
        val service = mock(CloudVideoUploadSessionService::class.java)
        given(service.purgeExpiredSessions(50)).willReturn(1)
        val job = CloudVideoUploadSessionCleanupScheduledJob(service, batchSize = 50)

        job.cleanupExpiredSessions()

        then(service).should().purgeExpiredSessions(50)
    }
}
