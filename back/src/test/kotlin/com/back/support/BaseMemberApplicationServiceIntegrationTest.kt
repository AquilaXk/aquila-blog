package com.back.support

import com.back.boundedContexts.member.adapter.persistence.MemberAttrPersistenceAdapter
import com.back.boundedContexts.member.adapter.persistence.MemberRepositoryAdapter
import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.member.application.service.MemberProfileHydrator
import com.back.global.app.AppConfig
import com.back.global.jpa.config.JpaConfig
import com.back.global.storage.application.UploadedFileRetentionService
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase
import org.springframework.context.annotation.Import
import org.springframework.test.context.bean.override.mockito.MockitoBean

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(
    MemberApplicationService::class,
    MemberRepositoryAdapter::class,
    MemberAttrPersistenceAdapter::class,
    MemberProfileHydrator::class,
    JpaConfig::class,
    AppConfig::class,
)
abstract class BaseMemberApplicationServiceIntegrationTest : BaseIntegrationTest() {
    @MockitoBean
    protected lateinit var uploadedFileRetentionService: UploadedFileRetentionService
}
