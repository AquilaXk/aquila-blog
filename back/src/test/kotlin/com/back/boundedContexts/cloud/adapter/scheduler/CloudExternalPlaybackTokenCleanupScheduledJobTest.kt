package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.boundedContexts.cloud.application.service.CloudExternalPlaybackTokenService
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock

@DisplayName("관리자 클라우드 외부 재생 token 정리 스케줄러 테스트")
class CloudExternalPlaybackTokenCleanupScheduledJobTest {
    @Test
    @DisplayName("만료 token 정리 작업은 설정된 batch size로 purge를 호출한다")
    fun `만료 token 정리 작업은 설정된 batch size로 purge를 호출한다`() {
        val service = mock(CloudExternalPlaybackTokenService::class.java)
        given(service.purgeExpiredTokens(50)).willReturn(3)
        val job = CloudExternalPlaybackTokenCleanupScheduledJob(service, batchSize = 50)

        job.cleanupExpiredTokens()

        then(service).should().purgeExpiredTokens(50)
    }
}
