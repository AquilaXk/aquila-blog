package com.back.support

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.app.AppConfig
import com.back.global.jpa.config.JpaConfig
import com.back.global.storage.application.PostAttachmentRetentionService
import com.back.global.storage.application.ProfileImageRetentionService
import com.back.global.storage.application.UploadedFilePurgeService
import com.back.global.storage.application.UploadedFileReferenceQueryService
import com.back.global.storage.application.UploadedFileRegistrationService
import com.back.global.storage.application.UploadedFileRetentionProperties
import com.back.global.storage.application.UploadedFileRetentionService
import org.junit.jupiter.api.BeforeAll
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(
    UploadedFileRetentionService::class,
    UploadedFileRegistrationService::class,
    PostAttachmentRetentionService::class,
    ProfileImageRetentionService::class,
    UploadedFilePurgeService::class,
    UploadedFileReferenceQueryService::class,
    JpaConfig::class,
    BaseUploadedFileRetentionServiceIntegrationTest.TestConfig::class,
)
abstract class BaseUploadedFileRetentionServiceIntegrationTest : BaseIntegrationTest() {
    @MockitoBean
    protected lateinit var postRepository: PostRepositoryPort

    @MockitoBean
    protected lateinit var memberAttrRepository: MemberAttrRepositoryPort

    @MockitoBean
    protected lateinit var postImageStoragePort: PostImageStoragePort

    companion object {
        @JvmStatic
        @BeforeAll
        fun setUpAppConfig() {
            AppConfig(
                siteBackUrl = "http://localhost:8080",
                siteFrontUrl = "http://localhost:3000",
                adminUsername = "admin",
                adminEmail = "admin@test.com",
                adminPassword = "",
            )
        }
    }

    @TestConfiguration
    class TestConfig {
        @Bean
        fun postImageStorageProperties(): PostImageStorageProperties = PostImageStorageProperties()

        @Bean
        fun uploadedFileRetentionProperties(): UploadedFileRetentionProperties = UploadedFileRetentionProperties()

        @Bean
        fun uploadedFileRetentionClock(): Clock = Clock.fixed(Instant.parse("2026-06-19T00:00:00Z"), ZoneOffset.UTC)
    }
}
