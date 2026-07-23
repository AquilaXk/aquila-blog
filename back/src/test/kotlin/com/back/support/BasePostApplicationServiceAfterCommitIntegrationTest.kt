package com.back.support

import com.back.boundedContexts.post.application.service.PostRecommendFeatureStoreService
import com.back.global.event.application.EventPublisher
import com.back.global.storage.application.UploadedFileRetentionService
import org.springframework.cache.CacheManager
import org.springframework.test.context.bean.override.mockito.MockitoBean

abstract class BasePostApplicationServiceAfterCommitIntegrationTest : BaseSeededIntegrationTest() {
    @MockitoBean
    protected lateinit var uploadedFileRetentionService: UploadedFileRetentionService

    @MockitoBean
    protected lateinit var postRecommendFeatureStoreService: PostRecommendFeatureStoreService

    @MockitoBean
    protected lateinit var eventPublisher: EventPublisher

    @MockitoBean
    protected lateinit var cacheManager: CacheManager
}
