package com.back.global.springDoc.config

import io.swagger.v3.oas.annotations.OpenAPIDefinition
import io.swagger.v3.oas.annotations.info.Info
import org.springdoc.core.models.GroupedOpenApi
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
@OpenAPIDefinition(info = Info(title = "API 서버", version = "beta", description = "API 서버 문서입니다."))
class SpringDocConfig {
    @Bean
    fun groupApiV1(): GroupedOpenApi {
        return GroupedOpenApi.builder()
            .group("apiV1")
            .pathsToMatch("/*/api/v1/**")
            .build()
    }

    @Bean
    fun groupMemberApiV1(): GroupedOpenApi {
        return GroupedOpenApi.builder()
            .group("memberApiV1")
            .pathsToMatch("/member/api/v1/**")
            .build()
    }

    @Bean
    fun groupPostApiV1(): GroupedOpenApi {
        return GroupedOpenApi.builder()
            .group("postApiV1")
            .pathsToMatch("/post/api/v1/**")
            .build()
    }

    @Bean
    fun groupController(): GroupedOpenApi {
        return GroupedOpenApi.builder()
            .group("controller")
            .pathsToExclude("/*/api/v1/**")
            .build()
    }
}
