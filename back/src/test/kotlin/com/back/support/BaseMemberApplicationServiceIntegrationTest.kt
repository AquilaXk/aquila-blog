package com.back.support

import com.back.boundedContexts.member.adapter.persistence.MemberAttrPersistenceAdapter
import com.back.boundedContexts.member.adapter.persistence.MemberRepositoryAdapter
import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.member.application.service.MemberProfileHydrator
import com.back.boundedContexts.member.application.service.MemberProfilePersistenceService
import com.back.global.app.AppConfig
import com.back.global.app.application.AppFacade
import com.back.global.jpa.config.JpaConfig
import com.back.global.storage.application.UploadedFileRetentionService
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.test.context.bean.override.mockito.MockitoBean
import tools.jackson.databind.ObjectMapper

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(
    MemberApplicationService::class,
    MemberProfilePersistenceService::class,
    MemberRepositoryAdapter::class,
    MemberAttrPersistenceAdapter::class,
    MemberProfileHydrator::class,
    AppFacade::class,
    JpaConfig::class,
    AppConfig::class,
    BaseMemberApplicationServiceIntegrationTest.JsonTestConfig::class,
)
abstract class BaseMemberApplicationServiceIntegrationTest : BaseIntegrationTest() {
    @MockitoBean
    protected lateinit var uploadedFileRetentionService: UploadedFileRetentionService

    @TestConfiguration
    class JsonTestConfig {
        @Bean
        fun objectMapper(): ObjectMapper = ObjectMapper()
    }
}
