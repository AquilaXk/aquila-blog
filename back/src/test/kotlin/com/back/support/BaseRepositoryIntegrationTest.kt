package com.back.support

import com.back.boundedContexts.post.adapter.persistence.PostDeletedQueryRepository
import com.back.global.app.application.AppFacade
import com.back.global.jpa.config.JpaConfig
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import tools.jackson.databind.ObjectMapper

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(
    JpaConfig::class,
    PostDeletedQueryRepository::class,
    AppFacade::class,
    BaseRepositoryIntegrationTest.JsonTestConfig::class,
)
abstract class BaseRepositoryIntegrationTest : BaseIntegrationTest() {
    @TestConfiguration
    class JsonTestConfig {
        @Bean
        fun objectMapper(): ObjectMapper = ObjectMapper()
    }
}
